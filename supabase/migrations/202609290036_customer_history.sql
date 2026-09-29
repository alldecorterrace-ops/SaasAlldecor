-- Read-only projection of existing per-record audit access into a customer dossier.
-- No business import, policy replacement, financial write or new role permission.
begin;
create index if not exists audit_company_id on public.audit_events(company_id,id desc);
create or replace function public.customer_history(p_company uuid,p_customer uuid,p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_access(p_company,'clientes','read') or not exists(
  select 1 from public.customers where company_id=p_company and id=p_customer
 ) then raise exception 'permission_denied' using errcode='42501';end if;
 if p_before is not null and p_before<1 then raise exception 'invalid_history_cursor';end if;
 -- Only these six entities are eligible. Every join includes its company.
 -- A snapshot must have the same association as its current record, on BOTH
 -- sides of an update. Reassigning a record must not disclose the old customer.
 with records as materialized (
  select 'customers'::text entity,c.id,'Ficha del cliente'::text label,'id'::text relation,c.id::text relation_id
  from public.customers c where c.company_id=p_company and c.id=p_customer
  union all
  select 'estimates',e.id,e.number,'customer_id',e.customer_id::text from public.estimates e
  where e.company_id=p_company and e.customer_id=p_customer and app_private.can_access(p_company,'fin-estimados','read')
  union all
  select 'invoices',i.id,i.number,'customer_id',i.customer_id::text from public.invoices i
  where i.company_id=p_company and i.customer_id=p_customer and app_private.can_access(p_company,'fin-invoices','read')
  union all
  select 'projects',p.id,p.name,'customer_id',p.customer_id::text from public.projects p
  where p.company_id=p_company and p.customer_id=p_customer and app_private.can_access(p_company,'fin-proyectos','read')
  union all
  select 'payments',p.id,i.number,'invoice_id',p.invoice_id::text from public.payments p
  join public.invoices i on i.company_id=p.company_id and i.id=p.invoice_id
  where p.company_id=p_company and i.customer_id=p_customer and app_private.can_access(p_company,'fin-invoices','read')
  union all
  select 'expenses',e.id,e.category,'project_id',e.project_id::text from public.expenses e
  join public.projects p on p.company_id=e.company_id and p.id=e.project_id
  where e.company_id=p_company and p.customer_id=p_customer and app_private.can_access(p_company,'gastos','read') and app_private.can_access(p_company,'fin-proyectos','read')
 ), bounded as materialized (
  select a.*,r.label from public.audit_events a join records r on r.entity=a.entity and r.id::text=a.entity_id
  where a.company_id=p_company and a.operation in ('INSERT','UPDATE') and (p_before is null or a.id<p_before)
   and a.after_data->>'company_id'=p_company::text and a.after_data->>'id'=r.id::text
   and a.after_data->>r.relation=r.relation_id
   and (a.before_data is null or (a.before_data->>'company_id'=p_company::text and a.before_data->>'id'=r.id::text and a.before_data->>r.relation=r.relation_id))
  order by a.id desc limit 31
 ), numbered as (select *,row_number() over(order by id desc) rn from bounded), projected as (
  select a.id,a.rn,jsonb_build_object(
   'id',a.id::text,'entity',a.entity,'record_id',a.entity_id,'record_label',a.label,
   'operation',a.operation,'created_at',a.created_at,'actor_id',a.actor_id,
   'revision',a.after_data->>'version','status',coalesce(a.after_data->>'status',''),
   'document_date',coalesce(a.after_data->>'client_date',a.after_data->>'estimate_date',a.after_data->>'invoice_date',a.after_data->>'project_date',a.after_data->>'payment_date',a.after_data->>'expense_date'),
   'amount',case when a.entity in ('estimates','invoices') then (a.after_data->>'total')::numeric(20,2)::text when a.entity in ('payments','expenses') then (a.after_data->>'amount')::numeric(20,2)::text end,
   'reason',coalesce(nullif(a.after_data->>'void_reason',''),nullif(a.after_data->>'decision_note',''),nullif(a.after_data->>'approval_note',''),''),
   'changed_fields',case when a.operation='INSERT' then '[]'::jsonb else (
    select coalesce(jsonb_agg(k order by k),'[]'::jsonb) from unnest(array[
     'full_name','email','phone','address','city','postal_code','service','client_date','notes','status',
     'estimate_date','valid_until','items','subtotal','discount','taxes','total',
     'invoice_date','due_date','paid_amount','balance_due','payment_status','void_reason',
     'name','project_date','start_date','end_date','payment_date','amount','method','reference',
     'expense_date','category','description','vendor','document_number','reimbursement_status','decision_note','receipt_path'
    ]) k where a.before_data->k is distinct from a.after_data->k
   ) end
  ) item from numbered a where a.rn<=30
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(item order by id desc) from projected),'[]'::jsonb),
  'next_before',case when (select count(*) from bounded)>30 then (select id::text from numbered where rn=30) end) into result;
 return result;
end;$$;
revoke all on function public.customer_history(uuid,uuid,bigint) from public,anon;
grant execute on function public.customer_history(uuid,uuid,bigint) to authenticated;
comment on function public.customer_history(uuid,uuid,bigint) is 'Whitelisted read-only customer audit projection; requires current membership and each existing record module permission. Never returns snapshots, tokens or storage paths.';
notify pgrst,'reload schema';
commit;
