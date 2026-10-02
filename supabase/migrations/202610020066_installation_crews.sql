-- Explicit installation teams, retaining legacy text and earlier rows unchanged.
begin;
create function app_private.guard_installation_crew() returns trigger
language plpgsql security definer set search_path='' as $$
declare crew jsonb;previous jsonb:='[]';ids text[];assigned uuid[];member uuid;
 ts timestamptz;te timestamptz;
begin
 if new.kind<>'installations' then return new;end if;
 -- All public entry points already use the work-actions mutex. Keep the
 -- schedule mutex as well so the guard is safe for trusted direct writes.
 perform pg_advisory_xact_lock(hashtextextended(new.company_id::text||':installations',0));
 if tg_op='UPDATE' then previous:=coalesce(old.data->'crew_worker_ids','[]');end if;
 -- An old application omits this field; omission never discards the new team.
 crew:=coalesce(new.data->'crew_worker_ids',previous);
 if jsonb_typeof(crew) is distinct from 'array' or jsonb_array_length(crew)>20 then raise exception 'invalid_crew' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(crew) v where jsonb_typeof(v)<>'string' or (v#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_crew' using errcode='22023';end if;
 select coalesce(array_agg(lower(v) order by lower(v)),array[]::text[]) into ids from jsonb_array_elements_text(crew) v;
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then raise exception 'invalid_crew' using errcode='22023';end if;
 crew:=to_jsonb(ids);
 if crew<>previous then
  if not app_private.can_access(new.company_id,'trabajadores','read') then raise exception 'crew_worker_unavailable' using errcode='42501';end if;
  for member in select v::uuid from unnest(ids) v loop
   -- Historical members may remain after deactivation. Newly selected
   -- members must be active in this company, locked through the save.
   if not (previous ? member::text) then
    perform 1 from public.workers where company_id=new.company_id and id=member and active for share;
    if not found then raise exception 'crew_worker_unavailable' using errcode='42501';end if;
   end if;
  end loop;
 end if;
 new.data:=jsonb_set(new.data,'{crew_worker_ids}',crew,true);
 select array_agg(distinct v) into assigned from (
  select new.worker_id v union all select v::uuid from unnest(ids) v
 ) a where v is not null;
 ts:=(new.data->>'starts_at')::timestamptz;te:=(new.data->>'ends_at')::timestamptz;
 if new.status<>'CANCELADA' and exists(
  select 1 from public.work_records w where w.company_id=new.company_id
  and w.kind='installations' and w.id<>new.id and w.status<>'CANCELADA'
  and (w.data->>'starts_at')::timestamptz<te and (w.data->>'ends_at')::timestamptz>ts
  and (w.worker_id=any(assigned) or coalesce(w.data->'crew_worker_ids','[]') ?| (select array_agg(v::text) from unnest(assigned) v))
 ) then raise exception 'schedule_overlap';end if;
 return new;
end;$$;
revoke all on function app_private.guard_installation_crew() from public,anon,authenticated;
create trigger installation_crew_guard before insert or update on public.work_records
for each row execute function app_private.guard_installation_crew();
-- No backfill: existing versions, receipts, audit and business data stay intact.
commit;
