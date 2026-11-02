-- One transition row per company separates the original writer from posting by lot.
begin;
-- Deferred checks run at COMMIT, after the authenticated RPC has returned.
alter function app_private.inventory_check_levels() security definer;
alter function app_private.inventory_check_parts() security definer;
alter function app_private.inventory_check_options() security definer;
create table app_private.inventory_control (
 company_id uuid primary key references public.companies(id), opening_id uuid,
 foreign key(company_id,opening_id) references app_private.inventory_documents(company_id,id)
);
create table app_private.inventory_requests (
 company_id uuid not null references public.companies(id), request_id uuid not null, actor_id uuid not null,
 operation text not null, payload jsonb not null, document_id uuid not null, created_at timestamptz not null default now(),
 primary key(company_id,request_id), foreign key(company_id,actor_id) references public.memberships(company_id,user_id),
 foreign key(company_id,document_id) references app_private.inventory_documents(company_id,id)
);
alter table app_private.inventory_control enable row level security;
alter table app_private.inventory_requests enable row level security;
revoke all on app_private.inventory_control,app_private.inventory_requests from public,anon,authenticated,service_role;

create function app_private.inventory_transition(p_company uuid,p_exclusive boolean default false) returns uuid
language plpgsql set search_path='' as $$
declare opened uuid;
begin
 insert into app_private.inventory_control(company_id) values(p_company) on conflict do nothing;
 if p_exclusive then
   select opening_id into strict opened from app_private.inventory_control where company_id=p_company for update;
 else
   select opening_id into strict opened from app_private.inventory_control where company_id=p_company for share;
 end if;
 return opened;
end;
$$;
create function app_private.inventory_guard_old_writer() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if tg_table_name='work_records' then
   if (tg_op='INSERT' or old.kind<>'inventory') and (tg_op='DELETE' or new.kind<>'inventory') then
     if tg_op='DELETE' then return old; end if; return new;
   end if;
 end if;
 if tg_op='DELETE' then cid:=old.company_id; else cid:=new.company_id; end if;
 if app_private.inventory_transition(cid) is not null then raise exception 'inventory_use_lot_ledger' using errcode='55000'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
create trigger inventory_legacy_freeze before insert or update or delete on public.work_records
 for each row execute function app_private.inventory_guard_old_writer();
create trigger inventory_legacy_freeze before insert or update or delete on public.inventory_movements
 for each row execute function app_private.inventory_guard_old_writer();
create trigger inventory_mapping_freeze before insert or update or delete on app_private.inventory_opening_map
 for each row execute function app_private.inventory_guard_old_writer();

-- After activation, the old records contain location text and reference costs with no granular scopes.
-- This also protects existing history/attachment APIs that use the same module authorization.
create or replace function app_private.can_access(p_company uuid,p_module text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.platform_access_allowed() and (p_action='read' or app_private.billing_writable(p_company))
 and exists(select from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active
 and (m.role in ('owner','admin') or (
   (p_module<>'inventario' or not exists(select from app_private.inventory_control c where c.company_id=p_company and c.opening_id is not null))
   and (coalesce(m.permissions->p_module ? p_action,false) or (p_action='read' and coalesce(m.permissions->p_module ? 'write',false))))));
$$;
create function public.inventory_is_active(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_member(p_company) and exists(select from app_private.inventory_control where company_id=p_company and opening_id is not null);
$$;
create or replace function app_private.inventory_location_allowed(p_company uuid,p_location uuid,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_action in ('stock.view','purchases.create','purchases.void','transfers.create','transfers.void','adjustments.create')
 and app_private.is_member(p_company) and exists(select from app_private.inventory_locations l where l.company_id=p_company and l.id=p_location and l.deleted_at is null
   and (p_action='stock.view' or (app_private.billing_writable(p_company) and (l.active or p_action in ('purchases.void','transfers.void'))))
   and (app_private.is_manager(p_company) or exists(select from app_private.inventory_location_access a where a.company_id=l.company_id and a.location_id=l.id
     and a.user_id=auth.uid() and (p_action='stock.view' or p_action=any(a.actions)))));
$$;
create function public.inventory_opening_stamp(p_company uuid) returns text language sql stable security definer set search_path='' as $$
 select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.item_id),'[]')::text) from public.inventory_opening_review(p_company) r;
$$;

-- Locking an empty request as well as an existing one makes double submission atomic.
create function app_private.inventory_replay(p_company uuid,p_request uuid,p_op text,p_payload jsonb) returns uuid
language plpgsql set search_path='' as $$
declare receipt app_private.inventory_requests;
begin
 if p_request is null or p_payload is null or octet_length(p_payload::text)>200000 then raise exception 'inventory_invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-request:'||p_company::text||':'||p_request::text,0));
 select * into receipt from app_private.inventory_requests where company_id=p_company and request_id=p_request;
 if found then
   if (receipt.actor_id,receipt.operation,receipt.payload) is distinct from (auth.uid(),p_op,p_payload)
     then raise exception 'inventory_request_conflict' using errcode='23505'; end if;
   return receipt.document_id;
 end if;
 return null;
end;
$$;
create function app_private.inventory_number(raw text,places integer) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if raw is null or raw !~ '^-?[0-9]{1,12}([.][0-9]+)?$' or length(split_part(raw,'.',2))>places then
   raise exception 'inventory_invalid_number' using errcode='22003'; end if;
 return raw::numeric;
end;
$$;
create function app_private.inventory_lock_locations(p_company uuid,ids uuid[],p_action text) returns void
language plpgsql set search_path='' as $$
declare loc uuid;
begin
 if not app_private.is_member(p_company) or not app_private.billing_writable(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 perform from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
 if not found then raise exception 'permission_denied' using errcode='42501'; end if;
 for loc in select distinct x from unnest(ids) x order by x loop
   perform from app_private.inventory_locations where company_id=p_company and id=loc and (active or p_action in ('purchases.void','transfers.void')) and deleted_at is null for update;
   if not found or not app_private.inventory_location_allowed(p_company,loc,p_action) then raise exception 'permission_denied' using errcode='42501'; end if;
 end loop;
end;
$$;

-- Resolve an output lot only if it is the sole available lot. A choice can span several lots.
create function app_private.inventory_pick_lots(p_company uuid,p_variant uuid,p_location uuid,p_qty numeric,p_choices jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare lots uuid[]; total numeric; result jsonb;
begin
 if p_choices is null or p_choices='[]'::jsonb then
   select array_agg(lot_id order by lot_id) into lots from app_private.inventory_lot_levels
     where company_id=p_company and variant_id=p_variant and location_id=p_location and quantity>0;
   if coalesce(cardinality(lots),0)=0 then raise exception 'inventory_insufficient_stock' using detail='0'; end if;
   if cardinality(lots)>1 then raise exception 'inventory_choose_lot'; end if;
   return jsonb_build_array(jsonb_build_object('lot',lots[1],'qty',p_qty));
 end if;
 if jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)>500 then raise exception 'inventory_invalid_allocations'; end if;
 if exists(select from jsonb_array_elements(p_choices) x where jsonb_typeof(x)<>'object' or x-'lot'-'qty'<>'{}' or
       x->>'lot' is null or app_private.inventory_number(x->>'qty',3)<=0) then raise exception 'inventory_invalid_allocations'; end if;
 select sum(q),jsonb_agg(jsonb_build_object('lot',lot,'qty',q) order by lot)
   into total,result from (select (x->>'lot')::uuid lot,sum(app_private.inventory_number(x->>'qty',3)) q
   from jsonb_array_elements(p_choices) x group by 1) parts;
 if total is distinct from p_qty then raise exception 'inventory_invalid_allocations'; end if;
 return result;
end;
$$;

-- The only writer of balances, lot balances and the signed ledger. The caller owns the transaction.
-- Locations are already locked in UUID order; disjoint locations can operate concurrently.
create function app_private.inventory_apply(p_company uuid,p_document uuid,plan jsonb) returns void
language plpgsql set search_path='' as $$
declare d app_private.inventory_documents; step record; part record; line app_private.inventory_document_lines;
 delta numeric; balance numeric; remaining numeric; unit_price numeric; entry bigint;
begin
 select * into strict d from app_private.inventory_documents where company_id=p_company and id=p_document;
 if jsonb_typeof(plan)<>'array' then raise exception 'inventory_invalid_movements'; end if;
 -- A completion/correction of a cost locks the same lot item before writing a valuation.
 perform 1 from app_private.inventory_lot_items i join (
   select distinct (p->>'lot')::uuid lot_id,(s->>'variant')::uuid variant_id from jsonb_array_elements(plan) s
   cross join lateral jsonb_array_elements(s->'parts') p
 ) ids on i.lot_id=ids.lot_id and i.variant_id=ids.variant_id where i.company_id=p_company order by i.lot_id,i.variant_id for share of i;
 for step in select * from jsonb_to_recordset(plan) as m(variant uuid,loc uuid,line_id uuid,kind text,qty numeric,parts jsonb,reversal bigint)
     order by variant,loc,line_id,kind loop
   select * into strict line from app_private.inventory_document_lines
     where company_id=p_company and id=step.line_id and document_id=p_document and variant_id=step.variant;
   delta:=step.qty;
   if delta>0 then
     insert into app_private.inventory_levels(company_id,variant_id,location_id,unit,quantity)
       values(p_company,step.variant,step.loc,line.unit,0) on conflict do nothing;
   end if;
   update app_private.inventory_levels set quantity=quantity+delta
     where company_id=p_company and variant_id=step.variant and location_id=step.loc and quantity+delta>=0 returning quantity into balance;
   if not found then
     select s.quantity into remaining from app_private.inventory_levels s where company_id=p_company and variant_id=step.variant and location_id=step.loc;
     raise exception 'inventory_insufficient_stock' using detail=coalesce(remaining,0)::text;
   end if;
   insert into app_private.inventory_ledger(company_id,line_id,document_kind,variant_id,location_id,unit,kind,quantity,balance,business_date,created_by,reversal_of)
     values(p_company,line.id,d.kind,step.variant,step.loc,line.unit,step.kind,delta,balance,d.business_date,auth.uid(),step.reversal) returning id into entry;
   for part in select * from jsonb_to_recordset(step.parts) as p(lot uuid,qty numeric,cost numeric) order by lot loop
     if part.qty<=0 or part.qty is null then raise exception 'inventory_invalid_allocations'; end if;
     select unit_cost into unit_price from app_private.inventory_lot_items where company_id=p_company and lot_id=part.lot and variant_id=step.variant;
     if not found then raise exception 'inventory_lot_unavailable'; end if;
     if step.reversal is not null then unit_price:=part.cost; end if;
     if delta>0 then
       insert into app_private.inventory_lot_levels(company_id,lot_id,variant_id,location_id,unit,quantity)
         values(p_company,part.lot,step.variant,step.loc,line.unit,0) on conflict do nothing;
     end if;
     update app_private.inventory_lot_levels set quantity=quantity+sign(delta)*part.qty
       where company_id=p_company and lot_id=part.lot and variant_id=step.variant and location_id=step.loc
       and quantity+sign(delta)*part.qty>=0;
     if not found then
       select quantity into remaining from app_private.inventory_lot_levels
         where company_id=p_company and lot_id=part.lot and variant_id=step.variant and location_id=step.loc;
       raise exception 'inventory_insufficient_lot' using detail=coalesce(remaining,0)::text;
     end if;
     insert into app_private.inventory_ledger_parts(company_id,movement_id,variant_id,lot_id,unit,quantity,unit_cost)
       values(p_company,entry,step.variant,part.lot,line.unit,sign(delta)*part.qty,unit_price);
   end loop;
 end loop;
end;
$$;
revoke all on function app_private.inventory_transition(uuid,boolean),app_private.inventory_guard_old_writer(),
 app_private.inventory_replay(uuid,uuid,text,jsonb),app_private.inventory_number(text,integer),
 app_private.inventory_lock_locations(uuid,uuid[],text),app_private.inventory_pick_lots(uuid,uuid,uuid,numeric,jsonb),
 app_private.inventory_apply(uuid,uuid,jsonb),public.inventory_is_active(uuid),public.inventory_opening_stamp(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.inventory_is_active(uuid),public.inventory_opening_stamp(uuid) to authenticated;
commit;
