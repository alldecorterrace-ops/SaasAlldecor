-- Read-only unified register: one projection per approved Workforce record.
-- Invoker RLS applies to both origins. No business imports, copies or payments.
begin;
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
   case e.pay_method when 'propio' then 'SIN_CONFIRMACION' when 'empresa' then 'NO_APLICA' when 'efectivo_empresa' then 'NO_APLICA' else 'SIN_DECLARAR' end,
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
  'workforce_unconfirmed',coalesce((select sum(amount) from ledger where source='WORKFORCE' and status<>'ANULADO' and reimbursement_status='SIN_CONFIRMACION'),0)::numeric(20,2)::text,
  'rows',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('amount',p.amount::text) order by p.date desc,p.source,p.id) from page_rows p),'[]'::jsonb))
 into result from pagination s;
 if p_export and (result->>'count')::integer>5000 then raise exception 'expense_export_limit' using errcode='54000';end if;
 return result;
end;$$;
revoke all on function public.expense_register(uuid,jsonb,integer,boolean) from public,anon;
grant execute on function public.expense_register(uuid,jsonb,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
