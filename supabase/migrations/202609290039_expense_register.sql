-- Filtered, read-only expense register. No business data migration or new access.
begin;
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
  select e.id,e.expense_date as date,e.vendor,e.document_number,e.category,e.description,e.amount,e.status,e.method,e.reimbursement_status,
   j.id as project_id,j.name as project_name,c.id as customer_id,c.full_name as customer_name,
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
