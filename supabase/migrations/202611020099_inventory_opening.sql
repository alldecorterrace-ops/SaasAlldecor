-- Read-only reconciliation for the legacy SaaS inventory. No opening is posted by this migration.
begin;
create function app_private.inventory_legacy_unit(input text) returns app_private.inventory_unit
language sql immutable strict set search_path='' as $$
 select (case
   when k in ('unidad','unidades','unit','units') then 'UNIDAD'
   when k in ('par','pares','pair','pairs') then 'PAR'
   when k in ('juego','juegos','set','sets') then 'JUEGO'
   when k in ('kg','kilogramo','kilogramos') then 'KG'
   when k in ('litro','litros','liter','liters') then 'LITRO'
   when k in ('metro','metros','meter','meters') then 'METRO'
 end)::app_private.inventory_unit from (select app_private.inventory_key(input) k) s;
$$;
create table app_private.inventory_opening_map (
 company_id uuid not null, item_id uuid not null, variant_id uuid not null, location_id uuid not null,
 source_sku text not null, source_location text not null, source_unit text not null,
 mapped_by uuid not null, mapped_at timestamptz not null default now(),
 primary key(company_id,item_id),
 foreign key(company_id,item_id) references public.work_records(company_id,id),
 foreign key(company_id,variant_id) references app_private.inventory_variants(company_id,id),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id),
 foreign key(company_id,mapped_by) references public.memberships(company_id,user_id)
);
alter table app_private.inventory_opening_map enable row level security;
revoke all on app_private.inventory_opening_map from public,anon,authenticated,service_role;
create trigger inventory_audit after insert or update or delete on app_private.inventory_opening_map
 for each row execute function app_private.inventory_audit_change();

create function public.map_inventory_opening_item(p_company uuid,p_item uuid,p_variant uuid,p_location uuid) returns void
language plpgsql security definer set search_path='' as $$
declare source public.work_records;
begin
 if not app_private.is_manager(p_company) or not app_private.billing_writable(p_company) then
   raise exception 'permission_denied' using errcode='42501'; end if;
 select * into source from public.work_records where company_id=p_company and id=p_item and kind='inventory' for share;
 if not found then raise exception 'inventory_item_unavailable'; end if;
 if not exists(select from app_private.inventory_variants v join app_private.inventory_families f on (f.company_id,f.id)=(v.company_id,v.family_id)
     where v.company_id=p_company and v.id=p_variant and v.active and f.active and v.unit=app_private.inventory_legacy_unit(source.data->>'unit') for share)
    or not exists(select from app_private.inventory_locations where company_id=p_company and id=p_location and active for share) then
   raise exception 'inventory_opening_target_unavailable'; end if;
 insert into app_private.inventory_opening_map(company_id,item_id,variant_id,location_id,source_sku,source_location,source_unit,mapped_by)
 values(p_company,p_item,p_variant,p_location,coalesce(source.data->>'sku',''),coalesce(source.data->>'location',''),coalesce(source.data->>'unit',''),auth.uid())
 on conflict(company_id,item_id) do update set variant_id=excluded.variant_id,location_id=excluded.location_id,
   source_sku=excluded.source_sku,source_location=excluded.source_location,source_unit=excluded.source_unit,
   mapped_by=excluded.mapped_by,mapped_at=now()
 where (inventory_opening_map.variant_id,inventory_opening_map.location_id,inventory_opening_map.source_sku,inventory_opening_map.source_location,inventory_opening_map.source_unit)
   is distinct from (excluded.variant_id,excluded.location_id,excluded.source_sku,excluded.source_location,excluded.source_unit);
end;
$$;

create function public.inventory_opening_review(p_company uuid)
returns table(item_id uuid,item_name text,source_sku text,source_location text,source_unit text,
 source_quantity numeric,history_quantity numeric,variant_id uuid,location_id uuid,variant_name text,location_name text,review_status text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 return query
 with history as (
   select m.item_id,sum(m.quantity) qty from public.inventory_movements m
   where m.company_id=p_company group by m.item_id
 ), source as (
   select w.id,w.name,w.stock,coalesce(h.qty,0) as ledger,coalesce(w.data->>'sku','') as sku,
     coalesce(w.data->>'location','') as loc,coalesce(w.data->>'unit','') as old_unit
   from public.work_records w left join history h on h.item_id=w.id
   where w.company_id=p_company and w.kind='inventory'
 ), resolved as (
   select s.*,v.id as vid,v.name as variant_name,v.unit,v.active and f.active as variant_active,
     l.id as lid,l.name as location_name,l.active as loc_active,places.matches,
     m.item_id is not null as mapped,
     (m.source_sku,m.source_location,m.source_unit) is distinct from (s.sku,s.loc,s.old_unit) as changed
   from source s
   left join app_private.inventory_opening_map m on m.company_id=p_company and m.item_id=s.id
   left join app_private.inventory_variants v on v.company_id=p_company and
     (case when m.item_id is not null then v.id=m.variant_id else v.sku_key=app_private.inventory_key(s.sku) end)
   left join app_private.inventory_families f on (f.company_id,f.id)=(v.company_id,v.family_id)
   left join lateral (select count(*) as matches,min(c.id::text)::uuid as candidate from app_private.inventory_locations c
       where c.company_id=p_company and c.name_key=app_private.inventory_key(s.loc)) places on true
   left join app_private.inventory_locations l on l.company_id=p_company and l.id=coalesce(m.location_id,places.candidate)
 ), assessed as (
 select r.*,
   case when r.stock='NaN'::numeric or r.ledger='NaN'::numeric then 'CANTIDAD_INVALIDA'
        when r.stock<>r.ledger then 'HISTORIAL_NO_CUADRA'
        when r.stock=0 then 'SIN_SALDO'
        when r.mapped and r.changed then 'MAPEO_DESACTUALIZADO'
        when r.vid is null or not r.variant_active then 'REVISAR_VARIANTE'
        when app_private.inventory_legacy_unit(r.old_unit) is distinct from r.unit then 'REVISAR_UNIDAD'
        when not app_private.inventory_valid_quantity(r.unit,r.stock) then 'CANTIDAD_FRACCIONARIA'
        when not r.mapped and r.matches>1 then 'UBICACION_AMBIGUA'
        when r.lid is null or not r.loc_active then 'REVISAR_UBICACION'
        else 'LISTO' end as state
 from resolved r
 )
 select r.id,r.name,r.sku,r.loc,r.old_unit,r.stock,r.ledger,r.vid,
   case when r.mapped or r.matches=1 then r.lid end,r.variant_name,case when r.mapped or r.matches=1 then r.location_name end,
   case when r.state='LISTO' and sum(r.stock) filter(where r.state='LISTO') over(partition by r.vid,r.lid)>999999999999.999
        then 'SALDO_EXCEDE_LIMITE' else r.state end
 from assessed r order by r.name,r.id;
end;
$$;
create function public.inventory_opening_manifest(p_company uuid)
returns table(lot_id uuid,lot_kind text,variant_id uuid,location_id uuid,quantity numeric,unit_cost numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 -- A STABLE call uses one snapshot for validation and grouping. Unknown costs are never replaced with zero.
 if exists(select from public.inventory_opening_review(p_company) where review_status not in ('LISTO','SIN_SALDO')) then
   raise exception 'inventory_opening_needs_review' using errcode='23514'; end if;
 return query select p_company,'ANTERIOR'::text,r.variant_id,r.location_id,sum(r.source_quantity),null::numeric
   from public.inventory_opening_review(p_company) r where r.review_status='LISTO'
   group by r.variant_id,r.location_id order by r.variant_id,r.location_id;
end;
$$;

-- Quantity-only projection. Supplier identity, purchase references and costs are absent by construction.
create function public.inventory_location_stock(p_company uuid,p_location uuid)
returns table(variant_id uuid,quantity numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.inventory_location_allowed(p_company,p_location,'stock.view') then
   raise exception 'permission_denied' using errcode='42501'; end if;
 return query select s.variant_id,s.quantity::numeric from app_private.inventory_levels s
   where s.company_id=p_company and s.location_id=p_location order by s.variant_id;
end;
$$;
create function public.inventory_location_costs(p_company uuid,p_location uuid)
returns table(variant_id uuid,lot_id uuid,quantity numeric,unit_cost numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.inventory_location_allowed(p_company,p_location,'stock.view')
    or not app_private.can_access(p_company,'inv-costos','read') then
   raise exception 'permission_denied' using errcode='42501'; end if;
 return query select s.variant_id,s.lot_id,s.quantity::numeric,i.unit_cost::numeric from app_private.inventory_lot_levels s
   join app_private.inventory_lot_items i on (i.company_id,i.lot_id,i.variant_id)=(s.company_id,s.lot_id,s.variant_id)
   where s.company_id=p_company and s.location_id=p_location and s.quantity>0 order by s.variant_id,s.lot_id;
end;
$$;
revoke all on function app_private.inventory_legacy_unit(text),public.map_inventory_opening_item(uuid,uuid,uuid,uuid),
 public.inventory_opening_review(uuid),public.inventory_opening_manifest(uuid),public.inventory_location_stock(uuid,uuid),public.inventory_location_costs(uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.map_inventory_opening_item(uuid,uuid,uuid,uuid),public.inventory_opening_review(uuid),
 public.inventory_opening_manifest(uuid),public.inventory_location_stock(uuid,uuid),public.inventory_location_costs(uuid,uuid) to authenticated;
commit;
