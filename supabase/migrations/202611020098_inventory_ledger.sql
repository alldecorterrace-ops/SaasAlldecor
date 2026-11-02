-- Storage for documents and their valued lots. Only the later transactional writer may post balances.
begin;
create function app_private.inventory_valid_quantity(p_unit app_private.inventory_unit,p_qty numeric) returns boolean
language sql immutable strict set search_path='' as $$
 select p_unit in ('KG','LITRO','METRO') or p_qty=trunc(p_qty);
$$;
create table app_private.inventory_documents (
 company_id uuid not null references public.companies(id), id uuid not null default gen_random_uuid(),
 kind text not null check(kind in ('COMPRA','TRASLADO','AJUSTE','ANTERIOR')),
 request_id uuid not null, request_payload jsonb not null check(jsonb_typeof(request_payload)='object'),
 business_date date not null, created_at timestamptz not null default now(), created_by uuid not null,
 location_id uuid, destination_id uuid, supplier_id uuid, supplier_reference text,
 required_location_kind text generated always as (case when kind='COMPRA' then 'ALMACEN' end) stored,
 adjustment_reason text check(adjustment_reason in ('MERMA','ROTURA','CONTEO_FISICO','OTRO','INVENTARIO_INICIAL')),
 notes text, tax_usd numeric(16,2) check(tax_usd>=0 and tax_usd<>'NaN'::numeric),
 void_by uuid, void_at timestamptz, void_reason text,
 primary key(company_id,id), unique(company_id,request_id), unique(company_id,id,kind),
 foreign key(company_id,created_by) references public.memberships(company_id,user_id),
 foreign key(company_id,void_by) references public.memberships(company_id,user_id),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id),
 foreign key(company_id,location_id,required_location_kind) references app_private.inventory_locations(company_id,id,kind),
 foreign key(company_id,destination_id) references app_private.inventory_locations(company_id,id),
 foreign key(company_id,supplier_id) references app_private.inventory_suppliers(company_id,id),
 check((kind='ANTERIOR')=(location_id is null)),
 check((kind='COMPRA')=(supplier_id is not null) and (kind='COMPRA' or (supplier_reference is null and tax_usd is null))),
 check((kind='TRASLADO')=(destination_id is not null) and (destination_id is null or destination_id<>location_id)),
 check((kind='AJUSTE')=(adjustment_reason is not null) and (kind<>'AJUSTE' or coalesce(length(trim(notes)),0)>0)),
 check((void_by is null and void_at is null and void_reason is null) or
       (kind in ('COMPRA','TRASLADO') and void_by is not null and void_at is not null and coalesce(length(trim(void_reason)),0)>0))
);
create unique index inventory_one_opening on app_private.inventory_documents(company_id) where kind='ANTERIOR';
create index inventory_docs_date on app_private.inventory_documents(company_id,kind,business_date desc,id);
create index inventory_docs_supplier on app_private.inventory_documents(company_id,supplier_id,business_date desc) where kind='COMPRA';
create function app_private.inventory_document_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'inventory_document_is_immutable' using errcode='55000'; end if;
 if tg_op='UPDATE' then
   if old.void_at is not null or new.void_at is null or
      (to_jsonb(new)-array['void_at','void_by','void_reason','required_location_kind']) is distinct from (to_jsonb(old)-array['void_at','void_by','void_reason','required_location_kind']) then
     raise exception 'inventory_document_is_immutable' using errcode='55000'; end if;
 elsif new.void_at is not null then raise exception 'inventory_invalid_void' using errcode='23514';
 elsif new.kind='COMPRA' then
   perform from app_private.inventory_locations where company_id=new.company_id and id=new.location_id and kind='ALMACEN' and active for share;
   if not found then raise exception 'inventory_active_warehouse_required' using errcode='23514'; end if;
   perform from app_private.inventory_suppliers where company_id=new.company_id and id=new.supplier_id and active for share;
   if not found then raise exception 'inventory_active_supplier_required' using errcode='23514'; end if;
 end if;
 return new;
end;
$$;
create trigger inventory_document_guard before insert or update or delete on app_private.inventory_documents
 for each row execute function app_private.inventory_document_guard();
create table app_private.inventory_document_lines (
 company_id uuid not null, id uuid not null default gen_random_uuid(), document_id uuid not null, document_kind text not null,
 variant_id uuid not null, unit app_private.inventory_unit not null, quantity app_private.inventory_quantity not null,
 unit_cost app_private.inventory_cost,
 primary key(company_id,id), unique(company_id,id,document_kind,variant_id),
 foreign key(company_id,document_id,document_kind) references app_private.inventory_documents(company_id,id,kind),
 foreign key(company_id,variant_id,unit) references app_private.inventory_variants(company_id,id,unit),
 check(quantity<>0 and (document_kind='AJUSTE' or quantity>0) and app_private.inventory_valid_quantity(unit,quantity)),
 check(unit_cost is null or (quantity>0 and document_kind in ('COMPRA','AJUSTE')))
);
create unique index inventory_purchase_variant on app_private.inventory_document_lines(company_id,document_id,variant_id) where document_kind='COMPRA';

create table app_private.inventory_lots (
 company_id uuid not null, id uuid not null default gen_random_uuid(), document_id uuid not null,
 kind text not null check(kind in ('COMPRA','INICIAL','SOBRANTE','ANTERIOR')),
 source_kind text generated always as (case when kind in ('INICIAL','SOBRANTE') then 'AJUSTE' else kind end) stored,
 primary key(company_id,id), unique(company_id,document_id),
 -- The opening manifest and the eventual posting use the same reserved lot ID.
 check((kind='ANTERIOR')=(id=company_id)),
 foreign key(company_id,document_id,source_kind) references app_private.inventory_documents(company_id,id,kind)
);
create table app_private.inventory_lot_items (
 company_id uuid not null, lot_id uuid not null, variant_id uuid not null, unit_cost app_private.inventory_cost,
 primary key(company_id,lot_id,variant_id),
 foreign key(company_id,lot_id) references app_private.inventory_lots(company_id,id),
 foreign key(company_id,variant_id) references app_private.inventory_variants(company_id,id)
);

create table app_private.inventory_levels (
 company_id uuid not null, variant_id uuid not null, location_id uuid not null, unit app_private.inventory_unit not null,
 quantity app_private.inventory_quantity not null check(quantity>=0 and app_private.inventory_valid_quantity(unit,quantity)),
 primary key(company_id,variant_id,location_id),
 foreign key(company_id,variant_id,unit) references app_private.inventory_variants(company_id,id,unit),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id)
);
create table app_private.inventory_lot_levels (
 company_id uuid not null, lot_id uuid not null, variant_id uuid not null, location_id uuid not null, unit app_private.inventory_unit not null,
 quantity app_private.inventory_quantity not null check(quantity>=0 and app_private.inventory_valid_quantity(unit,quantity)),
 primary key(company_id,lot_id,variant_id,location_id),
 foreign key(company_id,variant_id,unit) references app_private.inventory_variants(company_id,id,unit),
 foreign key(company_id,lot_id,variant_id) references app_private.inventory_lot_items(company_id,lot_id,variant_id),
 foreign key(company_id,variant_id,location_id) references app_private.inventory_levels(company_id,variant_id,location_id)
);
create index inventory_lot_levels_at on app_private.inventory_lot_levels(company_id,variant_id,location_id);
-- A posting and a location retirement must agree about which one happened first.
create function app_private.inventory_location_retirement() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'inventory_location_requires_soft_delete' using errcode='55000'; end if;
 if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
   raise exception 'inventory_location_already_removed' using errcode='55000'; end if;
 if old.deleted_at is null and new.deleted_at is not null and exists(
   select from app_private.inventory_levels where company_id=old.company_id and location_id=old.id and quantity>0
 ) then raise exception 'inventory_location_has_stock' using errcode='23514'; end if;
 return new;
end;
$$;
create trigger inventory_location_retirement before update or delete on app_private.inventory_locations
 for each row execute function app_private.inventory_location_retirement();
create function app_private.inventory_level_location() returns trigger language plpgsql set search_path='' as $$
begin
 if new.quantity>0 then
   perform from app_private.inventory_locations where company_id=new.company_id and id=new.location_id and deleted_at is null for share;
   if not found then raise exception 'inventory_location_removed' using errcode='23514'; end if;
 end if;
 return new;
end;
$$;
create trigger inventory_level_location before insert or update on app_private.inventory_levels
 for each row execute function app_private.inventory_level_location();
create table app_private.inventory_ledger (
 company_id uuid not null, id bigint generated always as identity, line_id uuid not null, document_kind text not null,
 variant_id uuid not null, location_id uuid not null, unit app_private.inventory_unit not null,
 kind text not null, quantity app_private.inventory_quantity not null, balance app_private.inventory_quantity not null,
 business_date date not null, created_at timestamptz not null default now(), created_by uuid not null, reversal_of bigint,
 primary key(company_id,id), unique(company_id,line_id,kind), unique(company_id,reversal_of),
 unique(company_id,id,variant_id), unique(company_id,id,variant_id,location_id),
 foreign key(company_id,line_id,document_kind,variant_id) references app_private.inventory_document_lines(company_id,id,document_kind,variant_id),
 foreign key(company_id,variant_id,unit) references app_private.inventory_variants(company_id,id,unit),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id),
 foreign key(company_id,created_by) references public.memberships(company_id,user_id),
 foreign key(company_id,reversal_of,variant_id,location_id) references app_private.inventory_ledger(company_id,id,variant_id,location_id),
 check(balance>=0 and app_private.inventory_valid_quantity(unit,balance) and app_private.inventory_valid_quantity(unit,quantity)),
 check((document_kind='COMPRA' and kind in ('COMPRA','ANULACION_COMPRA'))
    or (document_kind='TRASLADO' and kind in ('TRASLADO_SALIDA','TRASLADO_ENTRADA','ANULACION_TRASLADO_SALIDA','ANULACION_TRASLADO_ENTRADA'))
    or (document_kind='AJUSTE' and kind in ('AJUSTE_ENTRADA','AJUSTE_SALIDA')) or (document_kind='ANTERIOR' and kind='ANTERIOR')),
 check(quantity<>0 and (quantity>0)=(kind in ('COMPRA','TRASLADO_ENTRADA','ANULACION_TRASLADO_ENTRADA','AJUSTE_ENTRADA','ANTERIOR'))),
 check((reversal_of is not null)=(left(kind,9)='ANULACION') and reversal_of is distinct from id)
);
create index inventory_ledger_history on app_private.inventory_ledger(company_id,variant_id,location_id,id desc);
create table app_private.inventory_ledger_parts (
 company_id uuid not null, movement_id bigint not null, variant_id uuid not null, lot_id uuid not null,
 unit app_private.inventory_unit not null, quantity app_private.inventory_quantity not null,
 unit_cost app_private.inventory_cost,
 primary key(company_id,movement_id,lot_id), check(quantity<>0 and app_private.inventory_valid_quantity(unit,quantity)),
 foreign key(company_id,movement_id,variant_id) references app_private.inventory_ledger(company_id,id,variant_id),
 foreign key(company_id,variant_id,unit) references app_private.inventory_variants(company_id,id,unit),
 foreign key(company_id,lot_id,variant_id) references app_private.inventory_lot_items(company_id,lot_id,variant_id)
);
-- First valuations of movements originally missing a cost are separate from the immutable snapshot.
create table app_private.inventory_part_valuations (
 company_id uuid not null, movement_id bigint not null, lot_id uuid not null,
 unit_cost app_private.inventory_cost not null, recorded_at timestamptz not null default now(), recorded_by uuid not null,
 primary key(company_id,movement_id,lot_id),
 foreign key(company_id,movement_id,lot_id) references app_private.inventory_ledger_parts(company_id,movement_id,lot_id),
 foreign key(company_id,recorded_by) references public.memberships(company_id,user_id)
);
create function app_private.inventory_value_pending_part() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from app_private.inventory_ledger_parts where company_id=new.company_id and
   movement_id=new.movement_id and lot_id=new.lot_id and unit_cost is not null) then
   raise exception 'inventory_part_already_valued' using errcode='23514'; end if;
 return new;
end;
$$;
create trigger inventory_first_valuation before insert on app_private.inventory_part_valuations
 for each row execute function app_private.inventory_value_pending_part();
create function app_private.inventory_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'inventory_history_is_immutable' using errcode='55000'; end;
$$;
create function app_private.inventory_check_parts() returns trigger language plpgsql set search_path='' as $$
declare movement bigint; delta numeric; total numeric; same_sign boolean;
begin
 if tg_table_name='inventory_ledger' then movement:=new.id; else movement:=new.movement_id; end if;
 select quantity into strict delta from app_private.inventory_ledger where company_id=new.company_id and id=movement;
 select sum(quantity),bool_and(sign(quantity)=sign(delta)) into total,same_sign from app_private.inventory_ledger_parts
   where company_id=new.company_id and movement_id=movement;
 if total is distinct from delta or same_sign is distinct from true then
   raise exception 'inventory_lot_parts_mismatch' using errcode='23514'; end if;
 return null;
end;
$$;
create constraint trigger inventory_check_parts after insert on app_private.inventory_ledger
 deferrable initially deferred for each row execute function app_private.inventory_check_parts();
create constraint trigger inventory_check_parts after insert on app_private.inventory_ledger_parts
 deferrable initially deferred for each row execute function app_private.inventory_check_parts();

create function app_private.inventory_check_levels() returns trigger language plpgsql set search_path='' as $$
declare key_row record; aggregate_qty numeric; lot_qty numeric;
begin
 for key_row in select distinct (r->>'company_id')::uuid as cid,(r->>'variant_id')::uuid as vid,(r->>'location_id')::uuid as loc
   from (values(case when tg_op<>'INSERT' then to_jsonb(old) end),(case when tg_op<>'DELETE' then to_jsonb(new) end)) v(r)
   where r is not null
 loop
   select quantity into aggregate_qty from app_private.inventory_levels
     where (company_id,variant_id,location_id)=(key_row.cid,key_row.vid,key_row.loc);
   select sum(quantity) into lot_qty from app_private.inventory_lot_levels
     where (company_id,variant_id,location_id)=(key_row.cid,key_row.vid,key_row.loc);
   if coalesce(aggregate_qty,0)<>coalesce(lot_qty,0) then raise exception 'inventory_lot_balance_mismatch' using errcode='23514'; end if;
 end loop;
 return null;
end;
$$;
create constraint trigger inventory_check_levels after insert or update or delete on app_private.inventory_levels
 deferrable initially deferred for each row execute function app_private.inventory_check_levels();
create constraint trigger inventory_check_levels after insert or update or delete on app_private.inventory_lot_levels
 deferrable initially deferred for each row execute function app_private.inventory_check_levels();

do $protect$
declare rel text;
begin
 foreach rel in array array['inventory_documents','inventory_document_lines','inventory_lots','inventory_lot_items',
     'inventory_levels','inventory_lot_levels','inventory_ledger','inventory_ledger_parts','inventory_part_valuations'] loop
   execute format('alter table app_private.%I enable row level security',rel);
   execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',rel);
 end loop;
 foreach rel in array array['inventory_documents','inventory_document_lines','inventory_lots','inventory_lot_items','inventory_part_valuations'] loop
   execute format('create trigger inventory_audit after insert or update or delete on app_private.%I for each row execute function app_private.inventory_audit_change()',rel);
 end loop;
 foreach rel in array array['inventory_audit','inventory_document_lines','inventory_lots','inventory_ledger','inventory_ledger_parts','inventory_part_valuations'] loop
   execute format('create trigger inventory_immutable before update or delete on app_private.%I for each row execute function app_private.inventory_immutable()',rel);
 end loop;
end;
$protect$;
revoke all on function app_private.inventory_document_guard(),app_private.inventory_valid_quantity(app_private.inventory_unit,numeric),
 app_private.inventory_location_retirement(),app_private.inventory_level_location(),
 app_private.inventory_check_parts(),app_private.inventory_check_levels(),app_private.inventory_immutable(),
 app_private.inventory_value_pending_part() from public,anon,authenticated,service_role;
commit;
