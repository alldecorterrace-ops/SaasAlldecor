-- Additive expense capture. Existing payers remain unknown; no backfill/import.
begin;
alter table public.expenses add column payer text check(payer in ('EMPRESA','EFECTIVO_EMPRESA','TRABAJADOR'));
alter table public.expenses drop constraint expenses_method_check;
alter table public.expenses add constraint expenses_method_check check(method in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','ZELLE','OTRO'));
alter table public.expenses add constraint expenses_payer_relation check(payer is null or
 (payer='TRABAJADOR' and worker_id is not null and reimbursement_status<>'NO_APLICA') or
 (payer in ('EMPRESA','EFECTIVO_EMPRESA') and worker_id is null and reimbursement_status='NO_APLICA'));
CREATE OR REPLACE FUNCTION public.save_expense(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.expenses;proj uuid;worker uuid;dt date;cat text;descr text;ven text;doc text;a numeric;mt text;rs text;st text;dn text;changed boolean;pay text;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>15000 then raise exception 'invalid_expense';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then select * into oldrow from public.expenses where company_id=p_company and id=p_id for update;if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;end if;
 proj:=nullif(p_data->>'project_id','')::uuid;worker:=nullif(p_data->>'worker_id','')::uuid;
 pay:=case when p_data ? 'payer' then nullif(p_data->>'payer','') else oldrow.payer end;
 if (pay is not null and pay not in ('EMPRESA','EFECTIVO_EMPRESA','TRABAJADOR')) or (oldrow.payer is not null and pay is null) then raise exception 'invalid_payer';end if;
 if pay in ('EMPRESA','EFECTIVO_EMPRESA') then worker:=null;end if;
 if pay='TRABAJADOR' and worker is null then raise exception 'worker_required';end if;
 if proj is not null and (p_version=0 or proj is distinct from oldrow.project_id) then
  if not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=proj) then raise exception 'project_unavailable';end if;
 end if;
 if worker is not null and (p_version=0 or worker is distinct from oldrow.worker_id) then
  if not app_private.can_access(p_company,'trabajadores','read') or not exists(select 1 from public.workers where company_id=p_company and id=worker and active) then raise exception 'worker_unavailable';end if;
 end if;
 if coalesce(p_data->>'amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_amount';end if;
 dt:=(p_data->>'expense_date')::date;cat:=trim(p_data->>'category');descr:=coalesce(p_data->>'description','');ven:=trim(coalesce(p_data->>'vendor',''));doc:=trim(coalesce(p_data->>'document_number',''));a:=(p_data->>'amount')::numeric;mt:=p_data->>'method';rs:=p_data->>'reimbursement_status';st:=p_data->>'status';dn:=coalesce(p_data->>'decision_note','');
 if pay in ('EMPRESA','EFECTIVO_EMPRESA') then rs:='NO_APLICA';
 elsif pay='TRABAJADOR' and rs='NO_APLICA' then rs:='PENDIENTE';end if;
 if dt is null or cat is null or length(cat) not between 1 and 64 or length(descr)>2000 or length(ven)>190 or length(doc)>100 or a<=0 or mt is null or mt not in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','ZELLE','OTRO') or rs is null or rs not in ('NO_APLICA','PENDIENTE','REEMBOLSADO') or (rs<>'NO_APLICA' and worker is null) or st is null or st not in ('PENDIENTE','APROBADO','RECHAZADO','ANULADO') or length(dn)>2000 then raise exception 'invalid_expense';end if;
 if st in ('RECHAZADO','ANULADO') and length(trim(dn))<3 then raise exception 'reason_required';end if;
 changed:=p_version>0 and (proj,worker,dt,cat,descr,ven,doc,a,mt,pay) is distinct from (oldrow.project_id,oldrow.worker_id,oldrow.expense_date,oldrow.category,oldrow.description,oldrow.vendor,oldrow.document_number,oldrow.amount,oldrow.method,oldrow.payer);
 if not app_private.is_manager(p_company) then
  if p_version>0 and oldrow.status='ANULADO' then raise exception 'manager_required' using errcode='42501';end if;
  if (st in ('APROBADO','RECHAZADO','ANULADO') and (p_version=0 or st is distinct from oldrow.status)) or (rs='REEMBOLSADO' and (p_version=0 or rs is distinct from oldrow.reimbursement_status)) or (p_version>0 and dn is distinct from oldrow.decision_note) then raise exception 'manager_required' using errcode='42501';end if;
 end if;
 -- Editing approved/rejected financial data always requires a new review, even by an administrator.
 -- ADT requires accounting reversal before changing an already reimbursed payer,
 -- worker or amount, cancelling it, or removing its paid reimbursement state.
 if p_version>0 and oldrow.reimbursement_status='REEMBOLSADO' and
 ((a,worker,pay) is distinct from (oldrow.amount,oldrow.worker_id,oldrow.payer) or st='ANULADO' or rs<>'REEMBOLSADO') then
  raise exception 'reimbursed_expense_locked' using errcode='PT409';end if;
 if changed and oldrow.status in ('APROBADO','RECHAZADO') then st:='PENDIENTE';dn:='Datos corregidos; requiere nueva revisión.';end if;
 if p_version=0 then insert into public.expenses(id,company_id,project_id,worker_id,expense_date,category,description,vendor,document_number,amount,method,reimbursement_status,status,decision_note,payer,created_by,updated_by) values(p_id,p_company,proj,worker,dt,cat,descr,ven,doc,a,mt,rs,st,dn,pay,auth.uid(),auth.uid());
 else update public.expenses set project_id=proj,worker_id=worker,expense_date=dt,category=cat,description=descr,vendor=ven,document_number=doc,amount=a,method=mt,reimbursement_status=rs,status=st,decision_note=dn,payer=pay,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$function$;


create table public.expense_batches(
 company_id uuid not null references public.companies(id),id uuid not null,
 actor_id uuid not null references auth.users(id),request_hash text not null check(length(request_hash)=64),
 expense_ids uuid[] not null check(cardinality(expense_ids) between 1 and 100),
 created_at timestamptz not null default now(),primary key(company_id,id)
);
alter table public.expense_batches enable row level security;
revoke all on public.expense_batches from public,anon,authenticated;
grant select on public.expense_batches to authenticated;
create policy expense_batches_read on public.expense_batches for select to authenticated
 using(app_private.is_manager(company_id) and app_private.can_access(company_id,'gastos','read'));

create function public.save_expense_batch(p_company uuid,p_batch uuid,p_rows jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare prior public.expense_batches; hash text; row_data jsonb; row_id uuid; ids uuid[]:='{}';n integer:=0;pay text; code text;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_batch is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>1500000 then
  raise exception 'invalid_expense_batch' using errcode='22023';end if;
 hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 -- Serialize batch submissions per company before checking the durable receipt.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':expense-batches',0));
 select * into prior from public.expense_batches where company_id=p_company and id=p_batch;
 if found then
  if prior.actor_id<>auth.uid() or prior.request_hash<>hash then raise exception 'expense_batch_conflict' using errcode='PT409';end if;
  return prior.expense_ids;
 end if;
 for row_data in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;
  begin
   if jsonb_typeof(row_data)<>'object' or exists(select 1 from jsonb_object_keys(row_data) k where k not in
    ('id','project_id','worker_id','expense_date','category','description','vendor','document_number','amount','method','payer')) then
    raise exception 'invalid_expense';end if;
   row_id:=(row_data->>'id')::uuid;pay:=row_data->>'payer';
   if row_id is null or row_id=any(ids) or pay is null or pay not in ('EMPRESA','EFECTIVO_EMPRESA','TRABAJADOR') then raise exception 'invalid_expense';end if;
   if coalesce(row_data->>'amount','')!~'^[0-9]{1,8}(\.[0-9]{1,2})?$' or (row_data->>'amount')::numeric>10000000 or length(coalesce(row_data->>'description',''))>500 then raise exception 'invalid_amount_or_description';end if;
   if coalesce(row_data->>'expense_date','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_date';end if;
   perform public.save_expense(p_company,row_id,0,row_data||jsonb_build_object(
    'status','APROBADO','reimbursement_status',case when pay='TRABAJADOR' then 'PENDIENTE' else 'NO_APLICA' end,
    'decision_note','Registrado por administración.'));
   ids:=array_append(ids,row_id);
  exception when others then
   -- Never expose names or data from a duplicate belonging to another tenant.
   code:=case when sqlstate='23505' then 'duplicate_expense_document' when sqlstate='42501' then 'permission_denied'
    when sqlerrm in ('worker_required','worker_unavailable','project_unavailable','invalid_payer','invalid_amount_or_description','invalid_date') then sqlerrm else 'invalid_expense' end;
   raise exception 'expense_batch_row_%:%',n,code using errcode='22023';
  end;
 end loop;
 insert into public.expense_batches(company_id,id,actor_id,request_hash,expense_ids) values(p_company,p_batch,auth.uid(),hash,ids);
 return ids;
end;$$;
revoke all on function public.save_expense_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_expense_batch(uuid,uuid,jsonb) to authenticated;
create or replace function public.expense_register(p_company uuid,p_filters jsonb default '{}',p_page integer default 1,p_export boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 result jsonb; f jsonb:=p_filters;
 q text; filter_category text; state text; date_from date; date_to date; project uuid; customer uuid;
 projects_allowed boolean:=app_private.can_access(p_company,'fin-proyectos','read');
 customers_allowed boolean:=app_private.can_access(p_company,'clientes','read');
begin
 if not app_private.can_access(p_company,'gastos','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if f is null or jsonb_typeof(f)<>'object' or p_page is null or p_page not between 1 and 100000 or p_export is null then
  raise exception 'invalid_expense_filters' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(f) where key not in ('q','status','from','to','category','project','customer') or jsonb_typeof(value)<>'string') then
  raise exception 'invalid_expense_filters' using errcode='22023';end if;
 q:=btrim(coalesce(f->>'q',''));filter_category:=btrim(coalesce(f->>'category',''));state:=coalesce(nullif(f->>'status',''),'ACTIVOS');
 if length(q)>100 or length(filter_category)>64 or state not in ('ACTIVOS','TODOS','PENDIENTE','APROBADO','RECHAZADO','ANULADO') then
  raise exception 'invalid_expense_filters' using errcode='22023';end if;
 begin
  if coalesce(f->>'from','')<>'' and (f->>'from')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(f->>'to','')<>'' and (f->>'to')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'date';end if;
  date_from:=nullif(f->>'from','')::date;date_to:=nullif(f->>'to','')::date;
  project:=nullif(f->>'project','')::uuid;customer:=nullif(f->>'customer','')::uuid;
  if date_from>date_to then raise exception 'range';end if;
 exception when others then raise exception 'invalid_expense_filters' using errcode='22023';end;
 if (project is not null and not projects_allowed) or (customer is not null and (not projects_allowed or not customers_allowed)) then
  raise exception 'permission_denied' using errcode='42501';end if;
 -- A missing, foreign or revoked relation is never silently ignored.
 if (project is not null and not exists(select 1 from public.projects where company_id=p_company and id=project))
 or (customer is not null and not exists(select 1 from public.customers where company_id=p_company and id=customer)) then
  raise exception 'permission_denied' using errcode='42501';end if;
 with ledger as materialized (
  select e.id,e.expense_date as date,e.vendor,e.document_number,e.category,e.description,e.amount,e.status,e.method,e.reimbursement_status,e.payer,
   j.id as project_id,j.name as project_name,c.id as customer_id,c.full_name as customer_name,
   case when app_private.can_access(p_company,'trabajadores','read') then e.worker_id else null end as worker_id,
   case when app_private.can_access(p_company,'trabajadores','read') then (select w.name from public.workers w where w.company_id=e.company_id and w.id=e.worker_id) else null end as worker_name,
   e.receipt_path is not null as has_receipt
  from public.expenses e
  left join public.projects j on projects_allowed and j.company_id=e.company_id and j.id=e.project_id
  left join public.customers c on customers_allowed and c.company_id=j.company_id and c.id=j.customer_id
  where e.company_id=p_company
   and (state='TODOS' or (state='ACTIVOS' and e.status<>'ANULADO') or e.status=state)
   and (date_from is null or e.expense_date>=date_from) and (date_to is null or e.expense_date<=date_to)
   and (project is null or j.id=project) and (customer is null or c.id=customer)
   and (filter_category='' or e.category=filter_category)
   -- strpos treats %, _ and backslash literally; search cannot broaden itself.
   and (q='' or strpos(lower(e.vendor),lower(q))>0 or strpos(lower(e.description),lower(q))>0 or strpos(lower(e.document_number),lower(q))>0)
 ), summary as (
  select count(*)::integer as count,
   coalesce(sum(amount),0)::numeric(20,2)::text as total,
   coalesce(sum(amount) filter(where status<>'ANULADO'),0)::numeric(20,2)::text as active,
   coalesce(sum(amount) filter(where status<>'ANULADO' and reimbursement_status='PENDIENTE'),0)::numeric(20,2)::text as reimbursements
  from ledger
 ), pagination as (select *,case when p_export then 1 else least(p_page,greatest(1,(count+19)/20)) end as page from summary),
 page_rows as (
  select * from ledger order by date desc,id
  limit case when p_export then 5000 else 20 end offset (select (page-1)*20 from pagination)
 )
 select jsonb_build_object('count',s.count,'page',s.page,'total',s.total,'active',s.active,'reimbursements',s.reimbursements,
  'rows',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('amount',p.amount::text) order by p.date desc,p.id) from page_rows p),'[]'::jsonb))
 into result from pagination s;
 if p_export and (result->>'count')::integer>5000 then raise exception 'expense_export_limit' using errcode='54000';end if;
 return result;
end;$$;
revoke all on function public.expense_register(uuid,jsonb,integer,boolean) from public,anon;
grant execute on function public.expense_register(uuid,jsonb,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
