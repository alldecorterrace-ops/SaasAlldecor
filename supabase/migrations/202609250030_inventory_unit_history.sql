-- A zero balance does not erase the meaning of earlier inventory movements.
-- Keep their unit stable; this guard neither rewrites records nor backfills data.
begin;
create function app_private.preserve_inventory_unit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.kind='inventory'
    and new.data->>'unit' is distinct from old.data->>'unit'
    and exists(select 1 from public.inventory_movements m
               where m.company_id=old.company_id and m.item_id=old.id) then
  raise exception 'unit_locked';
 end if;
 return new;
end;
$$;
revoke all on function app_private.preserve_inventory_unit() from public,anon,authenticated;
create trigger inventory_unit_history_guard
before update of data on public.work_records
for each row execute function app_private.preserve_inventory_unit();
commit;
