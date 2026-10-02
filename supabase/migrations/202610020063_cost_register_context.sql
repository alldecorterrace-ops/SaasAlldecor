-- One statement snapshot for original expenses and reconciled derived Labor.
-- Read-only projection: no payroll, payments, import or expense posting.
begin;
create function public.cost_register_context(p_company uuid,p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f jsonb:=p_filters;base jsonb;ctx jsonb;projects jsonb;skip_original boolean:=false;
begin
 if f is null or jsonb_typeof(f)<>'object' then raise exception 'invalid_expense_filters' using errcode='22023';end if;
 if f->>'source'='LABOR' then f:=jsonb_set(f,'{source}','""');skip_original:=true;end if;
 if f->>'status'='CALCULADO' then f:=jsonb_set(f,'{status}','"ACTIVOS"');skip_original:=true;end if;
 -- Preserve the original validation, RLS and relation permission checks even
 -- when the requested source only contains derived rows.
 if (p_filters->>'source'='LABOR' or p_filters->>'status'='CALCULADO') and not app_private.can_read_labor(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 base:=public.expense_register(p_company,f,1,true);
 if skip_original then base:=base||jsonb_build_object('count',0,'rows','[]'::jsonb,'total','0.00','active','0.00','reimbursements','0.00','workforce_unconfirmed','0.00');end if;
 if app_private.can_read_labor(p_company) then
  ctx:=public.labor_context(p_company);
  select coalesce(jsonb_object_agg(j.id::text,jsonb_build_object('customer_id',c.id,'customer_name',c.full_name)),'{}') into projects
  from public.projects j left join public.customers c on app_private.can_access(p_company,'clientes','read') and c.company_id=j.company_id and c.id=j.customer_id
  where j.company_id=p_company;
 end if;
 return jsonb_build_object('ledger',base,'labor',ctx,'projects',coalesce(projects,'{}'));
end;$$;
revoke all on function public.cost_register_context(uuid,jsonb) from public,anon;
grant execute on function public.cost_register_context(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
