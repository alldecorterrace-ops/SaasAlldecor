-- Read-only customer ledger. Keep row security and existing module permissions.
-- No data import, financial mutation, direct customer-expense link or new access.
begin;
create or replace function public.customer_ledger(
 p_company uuid,p_customer uuid,p_section text,p_page integer default 1
) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_section is null or p_section not in ('pagos','gastos') or p_page is null or p_page not between 1 and 100000 then
  raise exception 'invalid_customer_ledger';
 end if;
 if not app_private.can_access(p_company,'clientes','read')
  or not exists(select 1 from public.customers where company_id=p_company and id=p_customer)
  or (p_section='pagos' and not app_private.can_access(p_company,'fin-invoices','read'))
  or (p_section='gastos' and (not app_private.can_access(p_company,'gastos','read') or not app_private.can_access(p_company,'fin-proyectos','read')))
 then raise exception 'permission_denied' using errcode='42501';end if;
 -- Totals, count, clamped page and rows share one statement snapshot. Summaries
 -- cover every matching record, never only the current page. Decimal strings
 -- preserve cents in JSON. Joins use both company and ID, never contact fields.
 with ledger as materialized (
  select p.id,p.payment_date as date,p.amount,
   case when p.status='APPLIED' then 'REGISTRADO' else 'ANULADO' end as status,
   p.method,p.reference,p.notes as description,''::text as vendor,
   ''::text as document_number,'NO_APLICA'::text as reimbursement_status,
   ''::text as category,i.id as parent_id,i.number as parent_label,
   false as has_receipt
  from public.payments p join public.invoices i on i.company_id=p.company_id and i.id=p.invoice_id
  where p_section='pagos' and p.company_id=p_company and i.customer_id=p_customer
  union all
  select e.id,e.expense_date,e.amount,e.status,e.method,''::text,
   e.description,e.vendor,e.document_number,e.reimbursement_status,e.category,
   j.id,j.name,e.receipt_path is not null
  from public.expenses e join public.projects j on j.company_id=e.company_id and j.id=e.project_id
  where p_section='gastos' and e.company_id=p_company and j.customer_id=p_customer and e.status<>'ANULADO'
 ), summary as (
  select count(*)::integer as count,
   coalesce(sum(amount) filter(where status<>'ANULADO'),0)::numeric(20,2)::text as total,
   coalesce(sum(amount) filter(where status='APROBADO'),0)::numeric(20,2)::text as approved,
   coalesce(sum(amount) filter(where status='PENDIENTE'),0)::numeric(20,2)::text as pending,
   coalesce(sum(amount) filter(where status='RECHAZADO'),0)::numeric(20,2)::text as rejected
  from ledger
 ), pagination as (
  select *,least(p_page,greatest(1,(count+19)/20)) as page from summary
 ), page_rows as (
  select * from ledger order by date desc,id
  limit 20 offset (select (page-1)*20 from pagination)
 )
 select jsonb_build_object('count',s.count,'page',s.page,'total',s.total,
  'approved',s.approved,'pending',s.pending,'rejected',s.rejected,
  'rows',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('amount',p.amount::text) order by p.date desc,p.id) from page_rows p),'[]'::jsonb))
 into result from pagination s;
 return result;
end;$$;
revoke all on function public.customer_ledger(uuid,uuid,text,integer) from public,anon;
grant execute on function public.customer_ledger(uuid,uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
