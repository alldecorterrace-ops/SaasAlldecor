begin;
create table app_private.inventory_minima (
 company_id uuid not null,location_id uuid not null,family_id uuid,variant_id uuid,unit app_private.inventory_unit not null,
 target_kind text generated always as (case when variant_id is null then 'FAMILY' else 'VARIANT' end) stored,
 target_id uuid generated always as (coalesce(variant_id,family_id)) stored,
 minimum app_private.inventory_quantity not null check(minimum>=0 and app_private.inventory_valid_quantity(unit,minimum)),
 primary key(company_id,location_id,target_kind,target_id),check(num_nonnulls(variant_id,family_id)=1),
 foreign key(company_id,location_id) references app_private.inventory_locations(company_id,id),
 foreign key(company_id,family_id,unit) references app_private.inventory_families(company_id,id,unit),
 foreign key(company_id,variant_id,unit) references app_private.inventory_variants(company_id,id,unit)
);
alter table app_private.inventory_minima enable row level security;
revoke all on app_private.inventory_minima from public,anon,authenticated,service_role;
create trigger inventory_minimum_audit after insert or update or delete on app_private.inventory_minima for each row execute function app_private.inventory_audit_change();
create function public.inventory_set_minimum(p_company uuid,p_request uuid,p_location uuid,p_kind text,p_target uuid,p_min numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare unit_kind app_private.inventory_unit; old_result uuid; body jsonb:=jsonb_build_object('location',p_location,'kind',p_kind,'target',p_target,'minimum',p_min);
begin
 if not app_private.can_access(p_company,'inv-catalogo','write') or not app_private.inventory_location_allowed(p_company,p_location,'stock.view')
 then raise exception 'permission_denied' using errcode='42501'; end if;
 old_result:=app_private.inventory_replay(p_company,p_request,'MINIMUM',body);if old_result is not null then return old_result; end if;
 perform from app_private.inventory_locations where company_id=p_company and id=p_location and active for share;
 if not found then raise exception 'inventory_location_removed'; end if;
 if p_kind='VARIANT' then select unit into unit_kind from app_private.inventory_variants where company_id=p_company and id=p_target;
 elsif p_kind='FAMILY' then select unit into unit_kind from app_private.inventory_families where company_id=p_company and id=p_target;
 end if;
 if unit_kind is null or p_min is null or app_private.inventory_number(p_min::text,3)<0 then raise exception 'inventory_invalid_quantity'; end if;
 insert into app_private.inventory_minima(company_id,location_id,family_id,variant_id,unit,minimum) values(p_company,p_location,
   case when p_kind='FAMILY' then p_target end,case when p_kind='VARIANT' then p_target end,unit_kind,p_min)
 on conflict(company_id,location_id,target_kind,target_id) do update set minimum=excluded.minimum;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,entity_id) values(p_company,p_request,auth.uid(),'MINIMUM',body,p_target);
 return p_target;
end;
$$;
create function public.inventory_minimum_rows(p_company uuid,p_location uuid default null,p_low boolean default true,p_target uuid default null)
returns table(target_id uuid,target_kind text,name text,location_id uuid,location_name text,unit text,quantity numeric,minimum numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_member(p_company) or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view'))
 then raise exception 'permission_denied' using errcode='42501'; end if;
 return query select m.target_id,m.target_kind,coalesce(v.name,f.name),m.location_id,l.name,m.unit::text,stock.qty,m.minimum::numeric
 from app_private.inventory_minima m join app_private.inventory_locations l on (l.company_id,l.id)=(m.company_id,m.location_id)
 left join app_private.inventory_variants v on (v.company_id,v.id)=(m.company_id,m.variant_id)
 left join app_private.inventory_families f on (f.company_id,f.id)=(m.company_id,m.family_id)
 cross join lateral(select coalesce(sum(x.quantity),0) qty from app_private.inventory_levels x join app_private.inventory_variants y on (y.company_id,y.id)=(x.company_id,x.variant_id)
   where x.company_id=m.company_id and x.location_id=m.location_id and (x.variant_id=m.variant_id or y.family_id=m.family_id)) stock
 where m.company_id=p_company and m.minimum>0 and app_private.inventory_location_allowed(p_company,m.location_id,'stock.view')
   and (p_location is null or m.location_id=p_location) and (p_target is null or m.target_id=p_target) and (not p_low or stock.qty<m.minimum)
 order by l.name,coalesce(v.name,f.name),m.target_kind,m.target_id;
end;
$$;
create function public.inventory_cost_report(p_company uuid,p_report text,p_group text,p_from date default null,p_to date default null,p_location uuid default null)
returns table(label text,unit text,quantity numeric,known_value numeric,pending numeric) language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'inv-costos','read') or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view')) or
    (p_report='COMPRAS' and not app_private.can_access(p_company,'inv-proveedores','read')) then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_report<>'VALOR' and p_from>p_to then raise exception 'inventory_invalid_dates'; end if;
 if p_report='VALOR' and p_group in ('LOCATION','CATEGORY','FAMILY') then
   return query select case p_group when 'LOCATION' then l.name||' · '||l.kind when 'CATEGORY' then coalesce(c.name,'Sin categoría') else f.code||' · '||f.name end,v.unit::text,
     sum(s.quantity),coalesce(sum(s.quantity*i.unit_cost),0),coalesce(sum(s.quantity) filter(where i.unit_cost is null),0)
   from app_private.inventory_lot_levels s join app_private.inventory_lot_items i using(company_id,lot_id,variant_id)
   join app_private.inventory_variants v on (v.company_id,v.id)=(s.company_id,s.variant_id) join app_private.inventory_families f on (f.company_id,f.id)=(v.company_id,v.family_id)
   left join app_private.inventory_categories c on (c.company_id,c.id)=(f.company_id,f.category_id)
   join app_private.inventory_locations l on (l.company_id,l.id)=(s.company_id,s.location_id)
   where s.company_id=p_company and s.quantity>0 and (p_location is null or s.location_id=p_location) and app_private.inventory_location_allowed(p_company,s.location_id,'stock.view')
   group by 1,2 order by 1,2;
 elsif p_report='PERDIDAS' then
   return query select l.name||' · '||l.kind||' · '||d.adjustment_reason,v.unit::text,sum(-p.quantity),coalesce(sum(-p.quantity*coalesce(p.unit_cost,av.unit_cost)),0),
      coalesce(sum(-p.quantity) filter(where coalesce(p.unit_cost,av.unit_cost) is null),0)
   from app_private.inventory_ledger m join app_private.inventory_ledger_parts p on (p.company_id,p.movement_id)=(m.company_id,m.id)
   left join app_private.inventory_part_valuations av on (av.company_id,av.movement_id,av.lot_id)=(p.company_id,p.movement_id,p.lot_id)
   join app_private.inventory_document_lines dl on (dl.company_id,dl.id)=(m.company_id,m.line_id)
   join app_private.inventory_documents d on (d.company_id,d.id)=(dl.company_id,dl.document_id)
   join app_private.inventory_locations l on (l.company_id,l.id)=(m.company_id,m.location_id)
   join app_private.inventory_variants v on (v.company_id,v.id)=(m.company_id,m.variant_id)
   where m.company_id=p_company and m.kind='AJUSTE_SALIDA' and app_private.inventory_location_allowed(p_company,m.location_id,'stock.view') and
     (p_location is null or m.location_id=p_location) and (p_from is null or m.business_date>=p_from) and (p_to is null or m.business_date<=p_to)
   group by 1,2 order by 1,2;
 elsif p_report='COMPRAS' then
   return query select s.name,v.unit::text,sum(dl.quantity),coalesce(sum(dl.quantity*i.unit_cost),0),coalesce(sum(dl.quantity) filter(where i.unit_cost is null),0)
   from app_private.inventory_documents d join app_private.inventory_suppliers s on (s.company_id,s.id)=(d.company_id,d.supplier_id)
   join app_private.inventory_document_lines dl on (dl.company_id,dl.document_id)=(d.company_id,d.id)
   join app_private.inventory_lots l on (l.company_id,l.document_id)=(d.company_id,d.id)
   join app_private.inventory_lot_items i on (i.company_id,i.lot_id,i.variant_id)=(l.company_id,l.id,dl.variant_id)
   join app_private.inventory_variants v on (v.company_id,v.id)=(dl.company_id,dl.variant_id)
   where d.company_id=p_company and d.kind='COMPRA' and d.void_at is null and app_private.inventory_document_visible(d) and
     (p_location is null or d.location_id=p_location) and (p_from is null or d.business_date>=p_from) and (p_to is null or d.business_date<=p_to)
   group by 1,2 order by 1,2;
 else raise exception 'inventory_invalid_report'; end if;
end;
$$;
revoke all on function public.inventory_set_minimum(uuid,uuid,uuid,text,uuid,numeric),public.inventory_minimum_rows(uuid,uuid,boolean,uuid),
 public.inventory_cost_report(uuid,text,text,date,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.inventory_set_minimum(uuid,uuid,uuid,text,uuid,numeric),public.inventory_minimum_rows(uuid,uuid,boolean,uuid),
 public.inventory_cost_report(uuid,text,text,date,date,uuid) to authenticated;
commit;
