begin;
create table app_private.inventory_revaluations(
 company_id uuid not null,request_id uuid not null,location_id uuid not null,variant_id uuid not null,
 boundary bigint not null,delta numeric not null,primary key(company_id,request_id,location_id),
 foreign key(company_id,request_id) references app_private.inventory_cost_events(company_id,request_id),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id),
 foreign key(company_id,variant_id) references app_private.inventory_variants(company_id,id)
);
alter table app_private.inventory_revaluations enable row level security;
revoke all on app_private.inventory_revaluations from public,anon,authenticated,service_role;
create function app_private.inventory_record_revaluation() returns trigger language plpgsql set search_path='' as $$
declare marker bigint;
begin
 if new.previous_cost is not null then
   marker:=nextval('app_private.inventory_ledger_id_seq');
   insert into app_private.inventory_revaluations(company_id,request_id,location_id,variant_id,boundary,delta)
   select new.company_id,new.request_id,s.location_id,s.variant_id,marker,s.quantity*(new.new_cost-new.previous_cost)
     from app_private.inventory_lot_levels s where s.company_id=new.company_id and s.lot_id=new.lot_id and s.variant_id=new.variant_id and s.quantity>0;
 end if; return null;
end;
$$;
create trigger inventory_revaluation after insert on app_private.inventory_cost_events for each row execute function app_private.inventory_record_revaluation();
create trigger inventory_revaluations_immutable before update or delete on app_private.inventory_revaluations for each row execute function app_private.inventory_immutable();
-- A reversal is booked at the original cost. Its resulting physical balance uses the
-- cost in force today. Preserve the difference separately from the movement's value.
create table app_private.inventory_reversal_values (
 company_id uuid not null,movement_id bigint not null,lot_id uuid not null,delta numeric not null,
 primary key(company_id,movement_id,lot_id),
 foreign key(company_id,movement_id,lot_id) references app_private.inventory_ledger_parts(company_id,movement_id,lot_id)
);
alter table app_private.inventory_reversal_values enable row level security;
revoke all on app_private.inventory_reversal_values from public,anon,authenticated,service_role;
create function app_private.inventory_record_reversal_value() returns trigger language plpgsql set search_path='' as $$
begin
 insert into app_private.inventory_reversal_values(company_id,movement_id,lot_id,delta)
 select new.company_id,new.movement_id,new.lot_id,new.quantity*(i.unit_cost-new.unit_cost)
 from app_private.inventory_ledger m join app_private.inventory_lot_items i on
   (i.company_id,i.lot_id,i.variant_id)=(new.company_id,new.lot_id,new.variant_id)
 where m.company_id=new.company_id and m.id=new.movement_id and m.reversal_of is not null and i.unit_cost<>new.unit_cost;
 return null;
end;
$$;
create trigger inventory_reversal_value after insert on app_private.inventory_ledger_parts for each row execute function app_private.inventory_record_reversal_value();
create trigger inventory_reversal_value_immutable before update or delete on app_private.inventory_reversal_values for each row execute function app_private.inventory_immutable();

-- Used by the download and the quantity pages. Never returns cost, value or supplier columns.
create function public.inventory_count_rows(p_company uuid,p_query text default '',p_location uuid default null,p_empty boolean default false,p_variant uuid default null)
returns table(family_id uuid,family_name text,variant_id uuid,sku text,variant_name text,unit text,location_id uuid,location_name text,quantity numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_member(p_company) or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view'))
 then raise exception 'permission_denied' using errcode='42501'; end if;
 return query select f.id,f.name,v.id,v.sku,v.name,v.unit::text,l.id,l.name,coalesce(s.quantity,0)::numeric
 from app_private.inventory_families f join app_private.inventory_variants v on (v.company_id,v.family_id)=(f.company_id,f.id)
 join app_private.inventory_locations l on l.company_id=f.company_id and app_private.inventory_location_allowed(p_company,l.id,'stock.view')
 left join app_private.inventory_levels s on (s.company_id,s.variant_id,s.location_id)=(v.company_id,v.id,l.id)
 where f.company_id=p_company and (p_location is null or l.id=p_location) and (p_variant is null or v.id=p_variant)
   and (s.quantity>0 or (p_empty and v.active and f.active and l.active))
   and app_private.inventory_family_matches(p_company,f.id,coalesce(p_query,''))
 order by f.name,f.id,v.sku,v.id,l.name,l.id;
end;
$$;
create function public.inventory_stock_rows(p_company uuid,p_query text default '',p_location uuid default null,p_empty boolean default false,p_variant uuid default null)
returns table(id uuid,name text,data jsonb) language sql stable security definer set search_path='' as $$
 with rows as materialized(select * from public.inventory_count_rows(p_company,p_query,p_location,p_empty,p_variant)), by_variant as (
 select r.family_id,r.family_name,r.variant_id,r.variant_name,r.sku,r.unit,sum(r.quantity) qty,
   jsonb_agg(jsonb_build_object('location',r.location_id,'name',r.location_name,'qty',r.quantity) order by r.location_name,r.location_id) locations
 from rows r group by r.family_id,r.family_name,r.variant_id,r.variant_name,r.sku,r.unit)
 select r.family_id,r.family_name,jsonb_build_object('qty',sum(r.qty),'variants',jsonb_agg(jsonb_build_object('id',r.variant_id,'name',r.variant_name,'sku',r.sku,'unit',r.unit,'qty',r.qty,'locations',r.locations)||
   case when app_private.can_access(p_company,'inv-costos','read') then jsonb_build_object('value',b.known,'pending',b.pending,'average',b.known/nullif(b.qty-b.pending,0)) else '{}' end
 order by r.sku,r.variant_id)) from by_variant r left join lateral app_private.inventory_balance(p_company,r.variant_id,p_location) b on app_private.can_access(p_company,'inv-costos','read')
 group by r.family_id,r.family_name order by r.family_name,r.family_id;
$$;
create function public.inventory_stock_total(p_company uuid,p_query text default '',p_location uuid default null,p_empty boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare totals jsonb;
begin
 if not app_private.can_access(p_company,'inv-costos','read') or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view'))
 then raise exception 'permission_denied' using errcode='42501'; end if;
 with by_unit as (select v.unit,coalesce(sum(s.quantity*i.unit_cost),0) known,coalesce(sum(s.quantity) filter(where i.unit_cost is null),0) waiting
 from app_private.inventory_lot_levels s join app_private.inventory_lot_items i using(company_id,lot_id,variant_id)
 join app_private.inventory_variants v on (v.company_id,v.id)=(s.company_id,s.variant_id)
 where s.company_id=p_company and app_private.inventory_location_allowed(p_company,s.location_id,'stock.view') and (p_location is null or s.location_id=p_location)
 and app_private.inventory_family_matches(p_company,v.family_id,coalesce(p_query,'')) group by v.unit)
 select jsonb_build_object('value',coalesce(sum(known),0),'pending',coalesce(sum(waiting),0),
   'pendingUnits',coalesce(jsonb_object_agg(unit,waiting) filter(where waiting>0),'{}')) into totals from by_unit;
 return totals;
end;
$$;
create function public.inventory_history(p_company uuid,p_variant uuid,p_location uuid default null)
returns table(id bigint,data jsonb) language plpgsql stable security definer set search_path='' as $$
declare costs boolean:=app_private.can_access(p_company,'inv-costos','read');
begin
 if not app_private.is_member(p_company) or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view'))
 then raise exception 'permission_denied' using errcode='42501'; end if;
 return query with visible as (
 select m.*,loc.name as locname,h.id as document_id,h.kind as document_kind_label,app_private.inventory_document_visible(h) link,mb.email actor,
   parts.known,parts.pending,parts.bridge,parts.rows as lot_parts
 from app_private.inventory_ledger m join app_private.inventory_document_lines dl on (dl.company_id,dl.id)=(m.company_id,m.line_id)
 join app_private.inventory_documents h on (h.company_id,h.id)=(dl.company_id,dl.document_id)
 join app_private.inventory_locations loc on (loc.company_id,loc.id)=(m.company_id,m.location_id)
 join public.memberships mb on (mb.company_id,mb.user_id)=(m.company_id,m.created_by)
 cross join lateral(select coalesce(sum(p.quantity*coalesce(p.unit_cost,av.unit_cost)),0) known,
     coalesce(sum(p.quantity) filter(where coalesce(p.unit_cost,av.unit_cost) is null),0) pending,coalesce(sum(rv.delta),0) bridge,
     jsonb_agg(jsonb_build_object('lot',p.lot_id,'label',app_private.inventory_lot_label(l,src),'qty',p.quantity)||
       case when costs then jsonb_build_object('cost',coalesce(p.unit_cost,av.unit_cost)) else '{}' end order by p.lot_id) rows
   from app_private.inventory_ledger_parts p join app_private.inventory_lots l on (l.company_id,l.id)=(p.company_id,p.lot_id)
   join app_private.inventory_documents src on (src.company_id,src.id)=(l.company_id,l.document_id)
   left join app_private.inventory_part_valuations av on (av.company_id,av.movement_id,av.lot_id)=(p.company_id,p.movement_id,p.lot_id)
   left join app_private.inventory_reversal_values rv on (rv.company_id,rv.movement_id,rv.lot_id)=(p.company_id,p.movement_id,p.lot_id)
   where p.company_id=m.company_id and p.movement_id=m.id) parts
 where m.company_id=p_company and m.variant_id=p_variant and (p_location is null or m.location_id=p_location) and app_private.inventory_location_allowed(p_company,m.location_id,'stock.view'))
 select v.id,jsonb_build_object('date',v.business_date,'kind',v.kind,'location',v.locname,'qty',v.quantity,'balance',v.balance,'actor',v.actor,'lots',v.lot_parts)||
  case when v.link then jsonb_build_object('document',v.document_id,'documentKind',v.document_kind_label) else '{}' end||
  case when costs then jsonb_build_object('value',v.known,'pending',abs(v.pending),'balancePending',sum(v.pending) over w,
       'balanceValue',sum(v.known+v.bridge) over w+coalesce((select sum(e.delta) from app_private.inventory_revaluations e where e.company_id=p_company
         and e.variant_id=p_variant and e.location_id=v.location_id and e.boundary<v.id),0)) else '{}' end from visible v
 window w as (partition by v.location_id order by v.id rows unbounded preceding) order by v.id desc;
end;
$$;
revoke all on function app_private.inventory_record_revaluation(),app_private.inventory_record_reversal_value(),public.inventory_count_rows(uuid,text,uuid,boolean,uuid),
 public.inventory_stock_rows(uuid,text,uuid,boolean,uuid),public.inventory_stock_total(uuid,text,uuid,boolean),public.inventory_history(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.inventory_count_rows(uuid,text,uuid,boolean,uuid),public.inventory_stock_rows(uuid,text,uuid,boolean,uuid),
 public.inventory_stock_total(uuid,text,uuid,boolean),public.inventory_history(uuid,uuid,uuid) to authenticated;
commit;
