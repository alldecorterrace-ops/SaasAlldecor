begin;
create function public.inventory_activate(p_company uuid,p_request uuid,p_date date,p_stamp text) returns uuid
language plpgsql security definer set search_path='' as $$
declare body jsonb:=jsonb_build_object('date',p_date,'stamp',p_stamp); prior uuid; opened uuid; doc uuid:=gen_random_uuid();
 row_data record; line_id uuid; plan jsonb:='[]'; parts jsonb;
begin
 if not app_private.is_manager(p_company) or not app_private.billing_writable(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 opened:=app_private.inventory_transition(p_company,true);
 prior:=app_private.inventory_replay(p_company,p_request,'OPEN',body);
 if prior is not null then return prior; end if;
 if opened is not null then raise exception 'inventory_already_active'; end if;
 if p_date is null or p_stamp is distinct from public.inventory_opening_stamp(p_company) then raise exception 'inventory_opening_changed'; end if;
 -- Reject unresolved items even if there are no positive balances.
 perform 1 from public.inventory_opening_manifest(p_company);
 insert into app_private.inventory_documents(company_id,id,kind,request_id,request_payload,business_date,created_by)
 values(p_company,doc,'ANTERIOR',p_request,body,p_date,auth.uid());
 insert into app_private.inventory_lots(company_id,id,document_id,kind) values(p_company,p_company,doc,'ANTERIOR');
 for row_data in select r.*,v.unit from public.inventory_opening_manifest(p_company) r
     join app_private.inventory_variants v on v.company_id=p_company and v.id=r.variant_id order by r.variant_id,r.location_id loop
   insert into app_private.inventory_lot_items(company_id,lot_id,variant_id) values(p_company,p_company,row_data.variant_id) on conflict do nothing;
   insert into app_private.inventory_document_lines(company_id,document_id,document_kind,variant_id,unit,quantity)
     values(p_company,doc,'ANTERIOR',row_data.variant_id,row_data.unit,row_data.quantity) returning id into line_id;
   parts:=jsonb_build_array(jsonb_build_object('lot',p_company,'qty',row_data.quantity));
   plan:=plan||jsonb_build_object('variant',row_data.variant_id,'loc',row_data.location_id,'line_id',line_id,'kind','ANTERIOR','qty',row_data.quantity,'parts',parts);
 end loop;
 perform app_private.inventory_apply(p_company,doc,plan);
 update app_private.inventory_control set opening_id=doc where company_id=p_company;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,document_id) values(p_company,p_request,auth.uid(),'OPEN',body,doc);
 return doc;
end;
$$;

create function public.inventory_post_document(p_company uuid,p_request uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare k text:=p_data->>'kind'; loc uuid:=(p_data->>'location')::uuid; dest uuid:=(p_data->>'destination')::uuid;
 supp uuid:=(p_data->>'supplier')::uuid; dt date:=(p_data->>'date')::date; why text:=p_data->>'reason';
 op text; prior uuid; doc uuid:=gen_random_uuid(); lot uuid; lid uuid; var_id uuid; u app_private.inventory_unit;
 rows jsonb:=p_data->'lines'; raw jsonb; pieces jsonb; step jsonb; plan jsonb:='[]';
 q numeric; cost numeric; tax numeric; may_cost boolean;
begin
 if not app_private.is_member(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or
    p_data-array['kind','location','destination','supplier','date','reference','reason','notes','tax','lines']<>'{}' or
    k is null or k not in ('COMPRA','TRASLADO','AJUSTE') or loc is null or dt is null or (p_data->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or loc=dest then raise exception 'inventory_invalid_document'; end if;
 op:=case k when 'COMPRA' then 'purchases.create' when 'TRASLADO' then 'transfers.create' else 'adjustments.create' end;
 if app_private.inventory_transition(p_company) is null then raise exception 'inventory_opening_required'; end if;
 prior:=app_private.inventory_replay(p_company,p_request,'POST',p_data);
 perform app_private.inventory_lock_locations(p_company,case when k='TRASLADO' then array[loc,dest] else array[loc] end,op);
 if prior is not null then return prior; end if;
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'inventory_invalid_lines'; end if;
 if length(coalesce(p_data->>'notes',''))>5000 or length(coalesce(p_data->>'reference',''))>180 then raise exception 'inventory_invalid_document'; end if;
 if (k='TRASLADO')<>(dest is not null) or (k='COMPRA')<>(supp is not null) or (k='AJUSTE')<>(why is not null) then raise exception 'inventory_invalid_document'; end if;
 may_cost:=app_private.can_access(p_company,'inv-costos','write');
 if p_data->>'tax' is not null then
   if not may_cost then raise exception 'permission_denied' using errcode='42501'; end if;
   tax:=app_private.inventory_number(p_data->>'tax',2);
 end if;
 if why='INVENTARIO_INICIAL' and exists(select from app_private.inventory_ledger m join app_private.inventory_document_lines dl
     on (dl.company_id,dl.id)=(m.company_id,m.line_id) join app_private.inventory_documents d on (d.company_id,d.id)=(dl.company_id,dl.document_id)
     where m.company_id=p_company and m.location_id=loc and d.adjustment_reason is distinct from 'INVENTARIO_INICIAL') then
   raise exception 'inventory_initial_period_closed'; end if;
 for raw in select value from jsonb_array_elements(rows) loop
   if jsonb_typeof(raw)<>'object' or raw-array['variant','qty','cost','lots']<>'{}' or raw->>'variant' is null then raise exception 'inventory_invalid_lines'; end if;
   q:=app_private.inventory_number(raw->>'qty',3);
   if q=0 or (q<0 and (k<>'AJUSTE' or why='INVENTARIO_INICIAL')) then raise exception 'inventory_invalid_quantity'; end if;
   if raw->>'cost' is not null then
     if not may_cost then raise exception 'permission_denied' using errcode='42501'; end if;
     if k='TRASLADO' or q<0 or app_private.inventory_number(raw->>'cost',4)<0 then raise exception 'inventory_invalid_cost'; end if;
   end if;
   if raw ? 'lots' and (jsonb_typeof(raw->'lots') is distinct from 'array' or
       ((k='COMPRA' or (k='AJUSTE' and q>0)) and raw->'lots'<>'[]')) then raise exception 'inventory_invalid_allocations'; end if;
 end loop;
 if k='COMPRA' then
   if exists(select (r->>'variant')::uuid from jsonb_array_elements(rows) r group by 1
     having count(distinct coalesce((r->>'cost')::numeric,-1))>1) then raise exception 'inventory_purchase_cost_conflict'; end if;
   select jsonb_agg(jsonb_build_object('variant',v,'qty',qty,'cost',price) order by v) into rows from
     (select (r->>'variant')::uuid v,sum((r->>'qty')::numeric) qty,min((r->>'cost')::numeric) price from jsonb_array_elements(rows) r group by 1) g;
 end if;
 insert into app_private.inventory_documents(company_id,id,kind,request_id,request_payload,business_date,created_by,
     location_id,destination_id,supplier_id,supplier_reference,adjustment_reason,notes,tax_usd)
 values(p_company,doc,k,p_request,p_data,dt,auth.uid(),loc,dest,supp,p_data->>'reference',why,p_data->>'notes',tax);
 if k='COMPRA' or (k='AJUSTE' and exists(select from jsonb_array_elements(rows) r where (r->>'qty')::numeric>0)) then
   insert into app_private.inventory_lots(company_id,document_id,kind) values(p_company,doc,
     case when k='COMPRA' then 'COMPRA' when why='INVENTARIO_INICIAL' then 'INICIAL' else 'SOBRANTE' end) returning id into lot;
 end if;
 for raw in select r from jsonb_array_elements(rows) with ordinality as l(r,n) order by (r->>'variant')::uuid,n loop
   var_id:=(raw->>'variant')::uuid; q:=(raw->>'qty')::numeric; cost:=(raw->>'cost')::numeric;
   select v.unit into u from app_private.inventory_variants v join app_private.inventory_families f on (f.company_id,f.id)=(v.company_id,v.family_id)
      where v.company_id=p_company and v.id=var_id and v.active and f.active for share of v,f;
   if not found then raise exception 'inventory_variant_unavailable'; end if;
   insert into app_private.inventory_document_lines(company_id,document_id,document_kind,variant_id,unit,quantity,unit_cost)
     values(p_company,doc,k,var_id,u,q,cost) returning id into lid;
   if k='COMPRA' or (k='AJUSTE' and q>0) then
     insert into app_private.inventory_lot_items(company_id,lot_id,variant_id,unit_cost) values(p_company,lot,var_id,cost) on conflict do nothing;
     if not exists(select from app_private.inventory_lot_items where company_id=p_company and lot_id=lot and variant_id=var_id
          and unit_cost is not distinct from cost) then raise exception 'inventory_purchase_cost_conflict'; end if;
     pieces:=jsonb_build_array(jsonb_build_object('lot',lot,'qty',q));
   else
     pieces:=app_private.inventory_pick_lots(p_company,var_id,loc,abs(q),raw->'lots');
   end if;
   step:=jsonb_build_object('variant',var_id,'line_id',lid,'parts',pieces);
   if k='TRASLADO' then
     plan:=plan||(step||jsonb_build_object('loc',loc,'kind','TRASLADO_SALIDA','qty',-q))
               ||(step||jsonb_build_object('loc',dest,'kind','TRASLADO_ENTRADA','qty',q));
   else
     plan:=plan||(step||jsonb_build_object('loc',loc,'kind',case when k='COMPRA' then 'COMPRA' when q>0 then 'AJUSTE_ENTRADA' else 'AJUSTE_SALIDA' end,'qty',q));
   end if;
 end loop;
 perform app_private.inventory_apply(p_company,doc,plan);
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,document_id) values(p_company,p_request,auth.uid(),'POST',p_data,doc);
 return doc;
end;
$$;

create function public.inventory_void_document(p_company uuid,p_request uuid,p_document uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d app_private.inventory_documents; prior uuid; plan jsonb;
 body jsonb:=jsonb_build_object('document',p_document,'reason',p_reason);
begin
 if not app_private.is_member(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 if app_private.inventory_transition(p_company) is null then raise exception 'inventory_opening_required'; end if;
 select * into d from app_private.inventory_documents where company_id=p_company and id=p_document and kind in ('COMPRA','TRASLADO');
 if not found then raise exception 'inventory_document_unavailable'; end if;
 prior:=app_private.inventory_replay(p_company,p_request,'VOID',body);
 perform app_private.inventory_lock_locations(p_company,case d.kind when 'COMPRA' then array[d.location_id] else array[d.location_id,d.destination_id] end,
   case d.kind when 'COMPRA' then 'purchases.void' else 'transfers.void' end);
 if prior is not null then return prior; end if;
 select * into strict d from app_private.inventory_documents where company_id=p_company and id=p_document for update;
 if d.void_at is not null then raise exception 'inventory_already_void'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'inventory_reason_required'; end if;
 -- Serialize against completing a pending cost before reading its historically effective snapshot.
 perform 1 from app_private.inventory_lot_items i where i.company_id=p_company and exists(
   select from app_private.inventory_document_lines l join app_private.inventory_ledger m on (m.company_id,m.line_id)=(l.company_id,l.id)
   join app_private.inventory_ledger_parts p on (p.company_id,p.movement_id)=(m.company_id,m.id)
   where l.company_id=p_company and l.document_id=d.id and (p.lot_id,p.variant_id)=(i.lot_id,i.variant_id))
   order by i.lot_id,i.variant_id for share;
 select jsonb_agg(jsonb_build_object('line_id',m.line_id,'variant',m.variant_id,'loc',m.location_id,'qty',-m.quantity,'reversal',m.id,
    'kind',case m.kind when 'COMPRA' then 'ANULACION_COMPRA' when 'TRASLADO_SALIDA' then 'ANULACION_TRASLADO_ENTRADA'
          when 'TRASLADO_ENTRADA' then 'ANULACION_TRASLADO_SALIDA' end,'parts',(
       select jsonb_agg(jsonb_build_object('lot',p.lot_id,'qty',abs(p.quantity),'cost',coalesce(p.unit_cost,v.unit_cost)) order by p.lot_id)
       from app_private.inventory_ledger_parts p left join app_private.inventory_part_valuations v using(company_id,movement_id,lot_id)
       where p.company_id=p_company and p.movement_id=m.id))) into plan from app_private.inventory_ledger m
 join app_private.inventory_document_lines l on (l.company_id,l.id)=(m.company_id,m.line_id)
 where m.company_id=p_company and l.document_id=d.id and m.reversal_of is null;
 if plan is null then raise exception 'inventory_document_unavailable'; end if;
 perform app_private.inventory_apply(p_company,d.id,plan);
 update app_private.inventory_documents set void_at=now(),void_by=auth.uid(),void_reason=trim(p_reason) where company_id=p_company and id=d.id;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,document_id) values(p_company,p_request,auth.uid(),'VOID',body,d.id);
 return d.id;
end;
$$;

create table app_private.inventory_cost_events(
 company_id uuid not null,request_id uuid not null,lot_id uuid not null,variant_id uuid not null,actor_id uuid not null,
 previous_cost app_private.inventory_cost,new_cost app_private.inventory_cost not null,reason text,created_at timestamptz not null default now(),
 primary key(company_id,request_id), foreign key(company_id,lot_id,variant_id) references app_private.inventory_lot_items(company_id,lot_id,variant_id),
 foreign key(company_id,actor_id) references public.memberships(company_id,user_id),check(previous_cost is null or length(trim(coalesce(reason,'')))>0)
);
alter table app_private.inventory_cost_events enable row level security;
revoke all on app_private.inventory_cost_events from public,anon,authenticated,service_role;
create trigger inventory_cost_history before update or delete on app_private.inventory_cost_events for each row execute function app_private.inventory_immutable();
create function public.inventory_value_lot(p_company uuid,p_request uuid,p_lot uuid,p_variant uuid,p_cost numeric,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d app_private.inventory_documents; old_price numeric; prior uuid;
 body jsonb:=jsonb_build_object('lot',p_lot,'variant',p_variant,'cost',p_cost,'reason',p_reason);
begin
 if not app_private.can_access(p_company,'inv-costos','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if app_private.inventory_transition(p_company) is null then raise exception 'inventory_opening_required'; end if;
 prior:=app_private.inventory_replay(p_company,p_request,'COST',body);
 select h.* into d from app_private.inventory_documents h join app_private.inventory_lots l on (l.company_id,l.document_id)=(h.company_id,h.id)
    where l.company_id=p_company and l.id=p_lot for share of h;
 if not found then raise exception 'inventory_lot_unavailable'; end if;
 if not app_private.is_manager(p_company) and not coalesce(app_private.inventory_location_allowed(p_company,d.location_id,'stock.view'),false)
    and not exists(select from app_private.inventory_lot_levels s where s.company_id=p_company and s.variant_id=p_variant and s.lot_id=p_lot
                   and app_private.inventory_location_allowed(p_company,s.location_id,'stock.view')) then
   raise exception 'permission_denied' using errcode='42501'; end if;
 if prior is not null then return prior; end if;
 if d.void_at is not null then raise exception 'inventory_already_void'; end if;
 if p_cost is null or p_cost<0 or p_cost<>round(p_cost,4) or p_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'inventory_invalid_cost'; end if;
 select unit_cost into old_price from app_private.inventory_lot_items where company_id=p_company and lot_id=p_lot and variant_id=p_variant for update;
 if not found then raise exception 'inventory_lot_unavailable'; end if;
 if old_price is not null then
   if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'inventory_reason_required'; end if;
   if d.kind='COMPRA' and not exists(
      select from app_private.inventory_document_lines dl left join app_private.inventory_lot_levels s
      on s.company_id=dl.company_id and s.lot_id=p_lot and s.variant_id=dl.variant_id and s.location_id=d.location_id
      where dl.company_id=p_company and dl.document_id=d.id and coalesce(s.quantity,0)<dl.quantity) then raise exception 'inventory_void_and_replace_purchase'; end if;
 else
   insert into app_private.inventory_part_valuations(company_id,movement_id,lot_id,unit_cost,recorded_by)
   select p.company_id,p.movement_id,p.lot_id,p_cost,auth.uid() from app_private.inventory_ledger_parts p
    where p.company_id=p_company and p.lot_id=p_lot and p.variant_id=p_variant and p.unit_cost is null
   on conflict do nothing;
 end if;
 insert into app_private.inventory_cost_events(company_id,request_id,lot_id,variant_id,actor_id,previous_cost,new_cost,reason)
   values(p_company,p_request,p_lot,p_variant,auth.uid(),old_price,p_cost,nullif(trim(p_reason),''));
 update app_private.inventory_lot_items set unit_cost=p_cost where company_id=p_company and lot_id=p_lot and variant_id=p_variant;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,document_id) values(p_company,p_request,auth.uid(),'COST',body,d.id);
 return d.id;
end;
$$;
revoke all on function public.inventory_activate(uuid,uuid,date,text),public.inventory_post_document(uuid,uuid,jsonb),
 public.inventory_void_document(uuid,uuid,uuid,text),public.inventory_value_lot(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.inventory_activate(uuid,uuid,date,text),public.inventory_post_document(uuid,uuid,jsonb),
 public.inventory_void_document(uuid,uuid,uuid,text),public.inventory_value_lot(uuid,uuid,uuid,uuid,numeric,text) to authenticated;
commit;
