-- Capability keys for the existing membership and invitation editors, independent of navigation.
begin;
insert into public.module_catalog(id,label,sort_order) values
 ('inv-proveedores','Proveedores de mercancía',24), ('inv-costos','Costos de inventario',25),
 ('inv-catalogo','Catálogo físico',26), ('inv-alta-productos','Alta de productos físicos',27),
 ('inv-precios','Precios de venta de variantes',28);

create function app_private.inventory_key(value text) returns text
language sql immutable strict set search_path='' as $$
  select lower(regexp_replace(value,'[[:space:]]+','','g'));
$$;

create type app_private.inventory_unit as enum ('UNIDAD','PAR','JUEGO','KG','LITRO','METRO');
create domain app_private.inventory_quantity as numeric(15,3) check(value <> 'NaN'::numeric);
create domain app_private.inventory_cost as numeric(17,4) check(value >= 0 and value <> 'NaN'::numeric);

create table app_private.inventory_locations (
 company_id uuid not null references public.companies(id), id uuid not null default gen_random_uuid(),
 kind text not null check(kind in ('ALMACEN','TIENDA')), name text not null check(length(name) <= 190),
 name_key text generated always as (app_private.inventory_key(name)) stored check(name_key <> ''),
 city text not null default '', address text not null default '',
 active boolean not null default true, deleted_at timestamptz check(deleted_at is null or not active),
 primary key(company_id,id), unique(company_id,kind,name_key), unique(company_id,id,kind)
);
create index inventory_location_lookup on app_private.inventory_locations(company_id,name_key);
create table app_private.inventory_location_access (
 company_id uuid not null, user_id uuid not null, location_id uuid not null,
 actions text[] not null default '{}' check(array_position(actions,null) is null and
     actions <@ array['purchases.create','purchases.void','transfers.create','transfers.void','adjustments.create']),
 primary key(company_id,user_id,location_id),
 foreign key(company_id,user_id) references public.memberships(company_id,user_id),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id)
);
create table app_private.inventory_suppliers (
 company_id uuid not null references public.companies(id), id uuid not null default gen_random_uuid(),
 name text not null check(length(name) <= 190),
 name_key text generated always as (app_private.inventory_key(name)) stored check(name_key <> ''),
 tax_identifier text, phone text, email text, address text, notes text, active boolean not null default true,
 primary key(company_id,id), unique(company_id,name_key)
);
create table app_private.inventory_categories (
 company_id uuid not null references public.companies(id), id uuid not null default gen_random_uuid(),
 name text not null check(length(name) <= 190),
 name_key text generated always as (app_private.inventory_key(name)) stored check(name_key <> ''),
 primary key(company_id,id), unique(company_id,name_key)
);
create table app_private.inventory_attributes (
 company_id uuid not null references public.companies(id), id uuid not null default gen_random_uuid(),
 name text not null check(length(name) <= 100),
 name_key text generated always as (app_private.inventory_key(name)) stored check(name_key <> ''),
 primary key(company_id,id), unique(company_id,name_key)
);
create table app_private.inventory_attribute_options (
 company_id uuid not null, id uuid not null default gen_random_uuid(), attribute_id uuid not null,
 name text not null check(length(name) <= 100),
 name_key text generated always as (app_private.inventory_key(name)) stored check(name_key <> ''),
 active boolean not null default true, primary key(company_id,id), unique(company_id,attribute_id,id),
 unique(company_id,attribute_id,name_key),
 foreign key(company_id,attribute_id) references app_private.inventory_attributes(company_id,id)
);
create table app_private.inventory_families (
 company_id uuid not null references public.companies(id), id uuid not null default gen_random_uuid(),
 code text not null check(length(trim(code)) between 1 and 100), name text not null check(length(trim(name)) between 1 and 190),
 category_id uuid, unit app_private.inventory_unit not null, description text, active boolean not null default true,
 commercial_product_id uuid, primary key(company_id,id), unique(company_id,code), unique(company_id,id,unit),
 unique(company_id,commercial_product_id),
 foreign key(company_id,category_id) references app_private.inventory_categories(company_id,id),
 foreign key(company_id,commercial_product_id) references public.products(company_id,id)
);
create table app_private.inventory_family_attributes (
 company_id uuid not null, family_id uuid not null, attribute_id uuid not null,
 primary key(company_id,family_id,attribute_id),
 foreign key(company_id,family_id) references app_private.inventory_families(company_id,id),
 foreign key(company_id,attribute_id) references app_private.inventory_attributes(company_id,id)
);
create table app_private.inventory_variants (
 company_id uuid not null, id uuid not null default gen_random_uuid(), family_id uuid not null, unit app_private.inventory_unit not null,
 sku text not null check(length(trim(sku)) between 1 and 100),
 sku_key text generated always as (app_private.inventory_key(sku)) stored check(sku_key <> ''),
 name text not null check(length(trim(name)) between 1 and 255), barcode text check(length(trim(barcode)) between 1 and 128 and barcode=trim(barcode)),
 sale_price numeric(14,2) check(sale_price >= 0 and sale_price <> 'NaN'::numeric), active boolean not null default true,
 option_ids uuid[] not null default '{}',
 primary key(company_id,id), unique(company_id,sku_key), unique(company_id,barcode),
 unique(company_id,family_id,option_ids), unique(company_id,id,family_id), unique(company_id,id,unit),
 foreign key(company_id,family_id,unit) references app_private.inventory_families(company_id,id,unit)
);
create table app_private.inventory_variant_options (
 company_id uuid not null, variant_id uuid not null, family_id uuid not null, attribute_id uuid not null, option_id uuid not null,
 primary key(company_id,variant_id,attribute_id),
 foreign key(company_id,variant_id,family_id) references app_private.inventory_variants(company_id,id,family_id),
 foreign key(company_id,family_id,attribute_id) references app_private.inventory_family_attributes(company_id,family_id,attribute_id),
 foreign key(company_id,attribute_id,option_id) references app_private.inventory_attribute_options(company_id,attribute_id,id)
);
-- The unique combination is the sorted option set, backed by company-qualified FKs.
create function app_private.inventory_check_options() returns trigger
language plpgsql set search_path='' as $$
declare row_data jsonb; v_id uuid; expected uuid[]; actual uuid[];
begin
 for row_data in
   select distinct r from (values (case when tg_op <> 'INSERT' then to_jsonb(old) end),
                                  (case when tg_op <> 'DELETE' then to_jsonb(new) end)) x(r) where r is not null
 loop
   v_id := (case when tg_table_name='inventory_variants' then row_data->>'id' else row_data->>'variant_id' end)::uuid;
   select option_ids into expected from app_private.inventory_variants
     where company_id=(row_data->>'company_id')::uuid and id=v_id;
   if not found then continue; end if;
   select coalesce(array_agg(option_id order by option_id),'{}') into actual
     from app_private.inventory_variant_options where company_id=(row_data->>'company_id')::uuid and variant_id=v_id;
   if expected is distinct from actual then raise exception 'inventory_variant_options_mismatch' using errcode='23514'; end if;
 end loop;
 return null;
end;
$$;
create constraint trigger inventory_variant_combination after insert or update on app_private.inventory_variants
 deferrable initially deferred for each row execute function app_private.inventory_check_options();
create constraint trigger inventory_option_combination after insert or update or delete on app_private.inventory_variant_options
 deferrable initially deferred for each row execute function app_private.inventory_check_options();

create function app_private.inventory_location_allowed(p_company uuid,p_location uuid,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_action in ('stock.view','purchases.create','purchases.void','transfers.create','transfers.void','adjustments.create')
 and app_private.is_member(p_company)
 and exists (select from app_private.inventory_locations l where l.company_id=p_company and l.id=p_location and l.deleted_at is null
   and (p_action='stock.view' or (l.active and app_private.billing_writable(p_company)))
   and (app_private.is_manager(p_company) or exists (
     select from app_private.inventory_location_access a where a.company_id=l.company_id and a.location_id=l.id
       and a.user_id=auth.uid() and (p_action='stock.view' or p_action=any(a.actions)))));
$$;

-- Private inventory audit is never exposed by the legacy generic history or activity routes.
create table app_private.inventory_audit (
 company_id uuid not null references public.companies(id), id bigint generated always as identity,
 entity text not null, actor_id uuid references auth.users(id), happened_at timestamptz not null default now(),
 before_data jsonb, after_data jsonb, primary key(company_id,id)
);
create function app_private.inventory_audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; current_row jsonb;
begin
 if tg_op <> 'INSERT' then prior:=to_jsonb(old); end if;
 if tg_op <> 'DELETE' then current_row:=to_jsonb(new); end if;
 insert into app_private.inventory_audit(company_id,entity,actor_id,before_data,after_data)
 values ((coalesce(current_row,prior)->>'company_id')::uuid,tg_table_name,auth.uid(),prior,current_row);
 return null;
end;
$$;
create function public.set_inventory_location_access(p_company uuid,p_user uuid,p_location uuid,p_actions text[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_manager(p_company) or not app_private.billing_writable(p_company) then
   raise exception 'permission_denied' using errcode='42501'; end if;
 if not exists(select from public.memberships where company_id=p_company and user_id=p_user and role='member' and active for share)
    or not exists(select from app_private.inventory_locations where company_id=p_company and id=p_location
      and (p_actions is null or active) for share) then raise exception 'inventory_assignment_unavailable'; end if;
 if p_actions is null then
   delete from app_private.inventory_location_access where company_id=p_company and user_id=p_user and location_id=p_location;
 else
   insert into app_private.inventory_location_access(company_id,user_id,location_id,actions)
     values(p_company,p_user,p_location,array(select distinct x from unnest(p_actions) x order by x))
   on conflict(company_id,user_id,location_id) do update set actions=excluded.actions
     where inventory_location_access.actions is distinct from excluded.actions;
 end if;
end;
$$;

do $protect$
declare rel text;
begin
 foreach rel in array array['inventory_locations','inventory_location_access','inventory_suppliers','inventory_categories',
    'inventory_attributes','inventory_attribute_options','inventory_families','inventory_family_attributes',
    'inventory_variants','inventory_variant_options','inventory_audit'] loop
   execute format('alter table app_private.%I enable row level security',rel);
   execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',rel);
   if rel <> 'inventory_audit' then
     execute format('create trigger inventory_audit after insert or update or delete on app_private.%I for each row execute function app_private.inventory_audit_change()',rel);
   end if;
 end loop;
end;
$protect$;
revoke all on function app_private.inventory_key(text),app_private.inventory_check_options(),
 app_private.inventory_location_allowed(uuid,uuid,text),app_private.inventory_audit_change(),
 public.set_inventory_location_access(uuid,uuid,uuid,text[]) from public,anon,authenticated,service_role;
grant execute on function public.set_inventory_location_access(uuid,uuid,uuid,text[]) to authenticated;
commit;
