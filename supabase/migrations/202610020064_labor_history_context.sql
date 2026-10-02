-- Read-only, tenant-scoped inputs for explicitly reconciling existing Labor.
-- No expense, payment or previous link is rewritten by this migration.
begin;
create or replace function app_private.labor_expense_snapshot(e public.expenses) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('project',e.project_id,'worker',e.worker_id,'date',e.expense_date,'amount',e.amount,'category',e.category,'status',e.status);
$$;
revoke all on function app_private.labor_expense_snapshot(public.expenses) from public,anon,authenticated;
-- Older correspondences lack the date. They stay recorded and require human
-- confirmation rather than silently acquiring a new source snapshot.
create function public.labor_history_context(p_company uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;n integer;
begin
 if not app_private.can_read_labor(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 select count(*) into n from public.expenses e where e.company_id=p_company and
 (e.category~*'mano.*obra|labor|subcontr|n[oó]mina' or exists(select 1 from public.labor_expense_links l where l.company_id=e.company_id and l.id=e.id));
 if n>20000 then raise exception 'labor_history_limit' using errcode='54000';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',e.id,'version',e.version,'project',e.project_id,'worker',e.worker_id,'date',e.expense_date,
 'amountCents',(e.amount*100)::bigint,'category',e.category,'description',e.description,'status',e.status,
 'link',case when l.id is null then null else jsonb_build_object('version',l.version,'active',l.active,'allocations',l.allocations,'matches',l.source_snapshot=jsonb_build_object('project',e.project_id,'worker',e.worker_id,'date',e.expense_date,'amount',e.amount,'category',e.category,'status',e.status),'reason',l.reason,'updatedAt',l.updated_at,'updatedBy',l.updated_by) end
 ) order by e.expense_date desc,e.id),'[]') into result
 from public.expenses e left join public.labor_expense_links l on l.company_id=e.company_id and l.id=e.id
 where e.company_id=p_company and (e.category~*'mano.*obra|labor|subcontr|n[oó]mina' or l.id is not null);
 return jsonb_build_object('company',p_company,'sources',result);
end;
$$;
revoke all on function public.labor_history_context(uuid) from public,anon,authenticated;
grant execute on function public.labor_history_context(uuid) to authenticated;
commit;
