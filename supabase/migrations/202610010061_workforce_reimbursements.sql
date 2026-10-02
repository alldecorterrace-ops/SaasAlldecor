-- Reimbursement is evidence of a previous payment, never a transfer.
-- Additive and no backfill: old unknown payers remain unresolved.
begin;
alter table public.workforce_expenses
 add column reimbursed_by uuid references auth.users(id),
 add column reimbursed_at timestamptz,
 add column reimbursement_note text,
 add column reimbursement_snapshot jsonb,
 add constraint workforce_reimbursement_evidence check(
  (reimbursed_by is null and reimbursed_at is null and reimbursement_note is null and reimbursement_snapshot is null)
  or (reimbursed_by is not null and reimbursed_at is not null and reimbursement_note is not null and length(trim(reimbursement_note)) between 5 and 500 and reimbursement_snapshot is not null and pay_method='propio')
 );
create function app_private.workforce_review_is_current(p_company uuid,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses; j app_private.workforce_receipt_reviews;sha text;tz text;
begin
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_read_workforce_expense_record(p_company,p_id) or e.admin_review_status<>'REVIEWED' or e.admin_reviewed_by is null or e.admin_reviewed_at is null then return false;end if;
 select u.sha256 into sha from public.workforce_receipt_uploads u where u.company_id=p_company and u.id=e.receipt_id and u.expense_id=e.id
 and exists(select 1 from storage.objects o where o.bucket_id='workforce-receipts' and o.name=p_company::text||'/'||e.id::text||'/'||u.id::text||'.'||u.extension);
 if sha is null then return false;end if;
 select timezone into tz from public.companies where id=p_company;
 if e.review_snapshot->>'mode'='manual-admin-v1' then
  return coalesce(e.review_snapshot->>'receipt'=e.receipt_id::text and e.review_snapshot->>'receipt_sha256'=sha
   and (e.review_snapshot->>'expense_epoch')::numeric=extract(epoch from e.expense_at)
   and (e.review_snapshot->>'amount')::numeric=e.amount and e.review_snapshot->>'project'=e.project_id::text
   and e.review_snapshot->>'pay_method'=e.pay_method and (e.review_snapshot->>'date')::date=(e.expense_at at time zone tz)::date
   and e.review_snapshot->>'category'=e.category and e.review_snapshot->>'description'=e.description,false);
 end if;
 if e.review_snapshot->>'mode'<>'receipt-v4' or e.receipt_review_id is null then return false;end if;
 select * into j from app_private.workforce_receipt_reviews where company_id=p_company and expense_id=p_id and id=e.receipt_review_id;
 return coalesce(found and j.status='DONE' and e.review_snapshot->>'job'=j.id::text
  and (e.review_snapshot-array['mode','job','state'])=app_private.receipt_review_snapshot(e)
  and j.snapshot=app_private.receipt_review_snapshot(e)
  and j.comparison_context=app_private.receipt_review_context(e,coalesce(nullif(j.result->>'date','')::date,(j.snapshot->>'date')::date)),false);
end;$$;
revoke all on function app_private.workforce_review_is_current(uuid,uuid) from public,anon;
grant execute on function app_private.workforce_review_is_current(uuid,uuid) to authenticated;

create function public.workforce_reimbursement_balances(p_company uuid,p_worker uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_worker is not null and not app_private.can_read_time_worker(p_company,p_worker) then raise exception 'permission_denied' using errcode='42501';end if;
 with visible as materialized (
  select e.*,w.name worker_name,c.timezone from public.workforce_expenses e join public.workers w on w.company_id=e.company_id and w.id=e.worker_id join public.companies c on c.id=e.company_id
  where e.company_id=p_company and (p_worker is null or e.worker_id=p_worker) and app_private.can_read_workforce_expense_record(e.company_id,e.id)
 ), debt as materialized (
  select *,app_private.workforce_review_is_current(company_id,id) reviewed from visible where status='OFFICE_APPROVED' and pay_method='propio' and reimbursed_at is null
 ), groups as (
  select worker_id,worker_name,sum(amount)::numeric(20,2)::text total,count(*)::integer count,count(*) filter(where not reviewed)::integer unreviewed,
   min((expense_at at time zone timezone)::date)::text first_date,max((expense_at at time zone timezone)::date)::text last_date,
   jsonb_agg(jsonb_build_object('id',id,'version',version,'amount',amount::text,'date',(expense_at at time zone timezone)::date,'description',description,'project',project_id,'reviewed',reviewed) order by expense_at,id) items
  from debt group by worker_id,worker_name
 ), paid as (select * from visible where reimbursed_at is not null order by reimbursed_at desc,id limit 20)
 select jsonb_build_object('debt',coalesce((select sum(amount) from debt),0)::numeric(20,2)::text,
  'company_paid',coalesce((select sum(amount) from visible where status='OFFICE_APPROVED' and pay_method in ('empresa','efectivo_empresa')),0)::numeric(20,2)::text,
  'unknown_payer',coalesce((select sum(amount) from visible where status='OFFICE_APPROVED' and pay_method is null),0)::numeric(20,2)::text,
  'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.total::numeric desc,g.worker_id) from groups g),'[]'),
  'recorded_count',(select count(*) from visible where reimbursed_at is not null),
  'recorded',coalesce((select jsonb_agg(jsonb_build_object('id',id,'worker_id',worker_id,'worker_name',worker_name,'amount',amount::text,'recorded_at',reimbursed_at,'actor',reimbursed_by,'note',reimbursement_note,'archived',status='ARCHIVED') order by reimbursed_at desc,id) from paid),'[]')) into answer;
 return answer;
end;$$;
revoke all on function public.workforce_reimbursement_balances(uuid,uuid) from public,anon;
grant execute on function public.workforce_reimbursement_balances(uuid,uuid) to authenticated;

create function public.record_workforce_reimbursement(p_company uuid,p_request uuid,p_worker uuid,p_items jsonb,p_total numeric,p_all boolean,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior app_private.workforce_expense_requests;e public.workforce_expenses;payload jsonb;answer jsonb;items jsonb;expected jsonb;sum_amount numeric:=0;selected uuid[];result_items jsonb:='[]';
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'reimbursement_forbidden' using errcode='42501';end if;
 if p_request is null or p_worker is null or p_all is null or p_note is null or length(trim(p_note)) not between 5 and 500 or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or p_total is null or p_total<=0 or round(p_total,2)<>p_total then raise exception 'invalid_reimbursement';end if;
 if not exists(select 1 from public.workers where company_id=p_company and id=p_worker) then raise exception 'reimbursement_forbidden' using errcode='42501';end if;
 begin
  if exists(select 1 from jsonb_array_elements(p_items) v where jsonb_typeof(v)<>'object' or not v ?& array['id','version'] or v-'id'-'version'<>'{}'::jsonb or jsonb_typeof(v->'id')<>'string' or jsonb_typeof(v->'version')<>'number' or (v->>'version')::numeric<>trunc((v->>'version')::numeric) or (v->>'version')::integer<1) then raise exception 'invalid';end if;
  select jsonb_agg(jsonb_build_object('id',(v->>'id')::uuid,'version',(v->>'version')::integer) order by (v->>'id')::uuid),array_agg((v->>'id')::uuid order by (v->>'id')::uuid) into items,selected from jsonb_array_elements(p_items) v;
  if (select count(distinct x) from unnest(selected) x)<>cardinality(selected) then raise exception 'duplicate';end if;
 exception when others then raise exception 'invalid_reimbursement' using errcode='22023';end;
 payload:=jsonb_build_object('operation','record_reimbursement','worker',p_worker,'items',items,'total',p_total,'all',p_all,'note',trim(p_note));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'reimbursement_forbidden' using errcode='42501';end if;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-reimburse:'||p_worker::text,0));
 -- Sorted row locks coordinate batches, individual confirmations and archives.
 perform 1 from public.workforce_expenses where company_id=p_company and worker_id=p_worker and id=any(selected) order by id for update;
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'horasfix','write') then raise exception 'reimbursement_forbidden' using errcode='42501';end if;
 select jsonb_agg(jsonb_build_object('id',id,'version',version) order by id),sum(amount) into expected,sum_amount
 from public.workforce_expenses where company_id=p_company and worker_id=p_worker and id=any(selected) and status='OFFICE_APPROVED' and pay_method='propio' and reimbursed_at is null;
 if expected is distinct from items or sum_amount is distinct from p_total then raise exception 'reimbursement_changed' using errcode='PT409';end if;
 if p_all and selected is distinct from (select array_agg(id order by id) from public.workforce_expenses where company_id=p_company and worker_id=p_worker and status='OFFICE_APPROVED' and pay_method='propio' and reimbursed_at is null) then raise exception 'reimbursement_changed' using errcode='PT409';end if;
 if exists(select 1 from unnest(selected) id where not app_private.workforce_review_is_current(p_company,id)) then raise exception 'reimbursement_review_required' using errcode='PT409';end if;
 for e in select * from public.workforce_expenses where company_id=p_company and id=any(selected) order by id loop
  update public.workforce_expenses set reimbursed_by=auth.uid(),reimbursed_at=now(),reimbursement_note=trim(p_note),
   reimbursement_snapshot=jsonb_build_object('request',p_request,'expense',app_private.receipt_review_snapshot(e),'review',e.review_snapshot,'reviewed_by',e.admin_reviewed_by,'reviewed_at',e.admin_reviewed_at,'expense_version',e.version,'allocation',e.allocation),
   version=version+1,updated_at=now() where company_id=p_company and id=e.id returning * into e;
  result_items:=result_items||jsonb_build_array(jsonb_build_object('id',e.id,'version',e.version,'amount',e.amount::text));
 end loop;
 answer:=jsonb_build_object('worker',p_worker,'count',cardinality(selected),'amount',sum_amount::numeric(20,2)::text,'items',result_items,'recorded_at',now(),'actor',auth.uid());
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,answer,now());
 return answer;
end;$$;
revoke all on function public.record_workforce_reimbursement(uuid,uuid,uuid,jsonb,numeric,boolean,text) from public,anon;
grant execute on function public.record_workforce_reimbursement(uuid,uuid,uuid,jsonb,numeric,boolean,text) to authenticated;


create or replace function public.expense_register(p_company uuid,p_filters jsonb default '{}',p_page integer default 1,p_export boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 result jsonb; f jsonb:=p_filters;
 q text; filter_category text; filter_payer text; filter_source text; month_start date; state text; date_from date; date_to date; project uuid; customer uuid; worker uuid;
 workers_allowed boolean:=app_private.can_access(p_company,'trabajadores','read');
 projects_allowed boolean:=app_private.can_access(p_company,'fin-proyectos','read');
 customers_allowed boolean:=app_private.can_access(p_company,'clientes','read');
begin
 if not app_private.can_access(p_company,'gastos','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if f is null or jsonb_typeof(f)<>'object' or p_page is null or p_page not between 1 and 100000 or p_export is null then
  raise exception 'invalid_expense_filters' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(f) where key not in ('q','status','from','to','category','project','customer','payer','worker','source') or jsonb_typeof(value)<>'string') then
  raise exception 'invalid_expense_filters' using errcode='22023';end if;
 select date_trunc('month',now() at time zone c.timezone)::date into month_start from public.companies c where c.id=p_company;
 filter_source:=coalesce(f->>'source','');
 if filter_source not in ('','ADMINISTRATIVE','WORKFORCE') then raise exception 'invalid_expense_filters' using errcode='22023';end if;
 filter_payer:=coalesce(f->>'payer','');
 if filter_payer not in ('','EMPRESA','EFECTIVO_EMPRESA','TRABAJADOR','SIN_REGISTRAR') then raise exception 'invalid_expense_filters' using errcode='22023';end if;
 q:=btrim(coalesce(f->>'q',''));filter_category:=btrim(coalesce(f->>'category',''));state:=coalesce(nullif(f->>'status',''),'ACTIVOS');
 if length(q)>100 or length(filter_category)>64 or state not in ('ACTIVOS','TODOS','PENDIENTE','APROBADO','RECHAZADO','ANULADO') then
  raise exception 'invalid_expense_filters' using errcode='22023';end if;
 begin
  if coalesce(f->>'from','')<>'' and (f->>'from')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(f->>'to','')<>'' and (f->>'to')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'date';end if;
  date_from:=nullif(f->>'from','')::date;date_to:=nullif(f->>'to','')::date;
  worker:=nullif(f->>'worker','')::uuid;
  project:=nullif(f->>'project','')::uuid;customer:=nullif(f->>'customer','')::uuid;
  if date_from>date_to then raise exception 'range';end if;
 exception when others then raise exception 'invalid_expense_filters' using errcode='22023';end;
 if (worker is not null and not workers_allowed) or (project is not null and not projects_allowed) or (customer is not null and (not projects_allowed or not customers_allowed)) then
  raise exception 'permission_denied' using errcode='42501';end if;
 -- A missing, foreign or revoked relation is never silently ignored.
 if (worker is not null and not exists(select 1 from public.workers where company_id=p_company and id=worker))
 or (project is not null and not exists(select 1 from public.projects where company_id=p_company and id=project))
 or (customer is not null and not exists(select 1 from public.customers where company_id=p_company and id=customer)) then
  raise exception 'permission_denied' using errcode='42501';end if;
 with raw_ledger as materialized (
  select e.id,'ADMINISTRATIVE'::text as source,e.expense_date as date,e.vendor,e.document_number,e.category,e.description,e.amount,e.status,e.method,e.reimbursement_status,e.payer,e.project_id,e.worker_id,e.receipt_path is not null as has_receipt
  from public.expenses e where e.company_id=p_company
  union all
  select e.id,'WORKFORCE'::text,(e.expense_at at time zone c.timezone)::date,''::text,''::text,
   case e.category when 'FUEL' then 'Combustible' when 'MATERIALS' then 'Materiales' when 'TOOLS' then 'Herramientas' when 'PARKING' then 'Estacionamiento' when 'TOLLS' then 'Peajes' else 'Otros' end,
   e.description,e.amount,case when e.status='ARCHIVED' then 'ANULADO' else 'APROBADO' end,
   'SIN_CONFIRMAR'::text,
   case e.pay_method when 'propio' then case when e.reimbursed_at is null then 'PENDIENTE' else 'PAGADO' end when 'empresa' then 'NO_APLICA' when 'efectivo_empresa' then 'NO_APLICA' else 'SIN_DECLARAR' end,
   case e.pay_method when 'propio' then 'TRABAJADOR' when 'empresa' then 'EMPRESA' when 'efectivo_empresa' then 'EFECTIVO_EMPRESA' end,
   case when e.allocation='PROJECT' then e.project_id end,e.worker_id,true
  from public.workforce_expenses e join public.companies c on c.id=e.company_id
  where e.company_id=p_company and (e.status='OFFICE_APPROVED' or (e.status='ARCHIVED' and e.archived_from_status='OFFICE_APPROVED'))
 ), visible_ledger as materialized (
  select e.id,e.source,e.date,e.vendor,e.document_number,e.category,e.description,e.amount,e.status,e.method,e.reimbursement_status,e.payer,
   j.id as project_id,j.name as project_name,c.id as customer_id,c.full_name as customer_name,
   case when workers_allowed then e.worker_id else null end as worker_id,
   case when workers_allowed then (select w.name from public.workers w where w.company_id=p_company and w.id=e.worker_id) else null end as worker_name,
   e.has_receipt
  from raw_ledger e
  left join public.projects j on projects_allowed and j.company_id=p_company and j.id=e.project_id
  left join public.customers c on customers_allowed and c.company_id=j.company_id and c.id=j.customer_id
  where (filter_source='' or e.source=filter_source)
   and (state='TODOS' or (state='ACTIVOS' and e.status<>'ANULADO') or e.status=state)
   and (date_from is null or e.date>=date_from) and (date_to is null or e.date<=date_to)
   and (worker is null or e.worker_id=worker)
   and (project is null or j.id=project) and (customer is null or c.id=customer)
   and (filter_category='' or e.category=filter_category)
   and (filter_payer='' or e.payer=filter_payer or (filter_payer='SIN_REGISTRAR' and e.payer is null))
 ), ledger as materialized (
  select * from visible_ledger
  -- Preserve ADT's field order and literal substring semantics, including spaces.
  -- Related names are already permission-scoped above; hidden fields cannot match.
  where q='' or strpos(lower(concat_ws(' ',date::text,category,vendor,description,document_number,
   coalesce(worker_name,''),coalesce(customer_name,''),coalesce(project_name,''))),lower(q))>0
 ), summary as (
  select count(*)::integer as count,
   coalesce(sum(amount),0)::numeric(20,2)::text as total,
   coalesce(sum(amount) filter(where status<>'ANULADO'),0)::numeric(20,2)::text as active,
   coalesce(sum(amount) filter(where status<>'ANULADO' and reimbursement_status='PENDIENTE'),0)::numeric(20,2)::text as reimbursements
  from ledger
 ), pagination as (select *,case when p_export then 1 else least(p_page,greatest(1,(count+19)/20)) end as page from summary),
 page_rows as (
  select * from ledger order by date desc,source,id
  limit case when p_export then 5000 else 20 end offset (select (page-1)*20 from pagination)
 )
 select jsonb_build_object('count',s.count,'page',s.page,'total',s.total,'active',s.active,'reimbursements',s.reimbursements,
  'overview',(select jsonb_build_object('month',to_char(month_start,'YYYY-MM'),'monthly',coalesce(sum(e.amount) filter(where e.date>=month_start and e.date<(month_start+interval '1 month')),0)::numeric(20,2)::text,'active',coalesce(sum(e.amount),0)::numeric(20,2)::text,'reimbursements',coalesce(sum(e.amount) filter(where e.reimbursement_status='PENDIENTE'),0)::numeric(20,2)::text) from raw_ledger e where e.status<>'ANULADO'),
  'workforce_unconfirmed',coalesce((select sum(amount) from ledger where source='WORKFORCE' and status<>'ANULADO' and reimbursement_status='PENDIENTE'),0)::numeric(20,2)::text,
  'rows',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('amount',p.amount::text) order by p.date desc,p.source,p.id) from page_rows p),'[]'::jsonb))
 into result from pagination s;
 if p_export and (result->>'count')::integer>5000 then raise exception 'expense_export_limit' using errcode='54000';end if;
 return result;
end;$$;
revoke all on function public.expense_register(uuid,jsonb,integer,boolean) from public,anon;
grant execute on function public.expense_register(uuid,jsonb,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
