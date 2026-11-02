-- Charges use the original merchandise value as weight. Tax always stays outside the lot.
begin;
alter table app_private.inventory_revaluations drop constraint inventory_revaluations_company_id_request_id_fkey, drop constraint inventory_revaluations_pkey;
alter table app_private.inventory_cost_events drop constraint inventory_cost_events_pkey,add primary key(company_id,request_id,variant_id);
alter table app_private.inventory_revaluations add primary key(company_id,request_id,variant_id,location_id),
 add foreign key(company_id,request_id,variant_id) references app_private.inventory_cost_events(company_id,request_id,variant_id);
create table app_private.inventory_purchase_charges(
 company_id uuid not null,request_id uuid not null,document_id uuid not null,kind text not null check(kind in ('FLETE','ADUANA','OTRO')),
 amount numeric(16,2) not null check(amount>0 and amount<>'NaN'::numeric),note text not null,actor_id uuid not null,created_at timestamptz not null default now(),
 primary key(company_id,request_id),foreign key(company_id,document_id) references app_private.inventory_documents(company_id,id),
 foreign key(company_id,actor_id) references public.memberships(company_id,user_id)
);
create table app_private.inventory_charge_lines(
 company_id uuid not null,request_id uuid not null,variant_id uuid not null,base_value numeric not null,share numeric(16,2) not null,
 unit_increment app_private.inventory_cost not null,primary key(company_id,request_id,variant_id),
 foreign key(company_id,request_id) references app_private.inventory_purchase_charges(company_id,request_id),
 foreign key(company_id,variant_id) references app_private.inventory_variants(company_id,id)
);
alter table app_private.inventory_purchase_charges enable row level security;
alter table app_private.inventory_charge_lines enable row level security;
revoke all on app_private.inventory_purchase_charges,app_private.inventory_charge_lines from public,anon,authenticated,service_role;
create trigger inventory_purchase_charge_immutable before update or delete on app_private.inventory_purchase_charges for each row execute function app_private.inventory_immutable();
create trigger inventory_charge_line_immutable before update or delete on app_private.inventory_charge_lines for each row execute function app_private.inventory_immutable();
create function app_private.inventory_split_charge(c uuid,doc uuid,amount numeric)
returns table(variant_id uuid,name text,lot_id uuid,qty numeric,base_value numeric,share numeric,unit_increment numeric,current_cost numeric)
language sql stable set search_path='' as $$
 with base as (
   select v.id,v.name,l.id lot,dl.quantity q,dl.quantity*coalesce(dl.unit_cost,first_value.new_cost) as merchandise,i.unit_cost as price
   from app_private.inventory_document_lines dl join app_private.inventory_lots l on (l.company_id,l.document_id)=(dl.company_id,dl.document_id)
   join app_private.inventory_lot_items i on (i.company_id,i.lot_id,i.variant_id)=(l.company_id,l.id,dl.variant_id)
   join app_private.inventory_variants v on (v.company_id,v.id)=(dl.company_id,dl.variant_id)
   left join lateral(select e.new_cost from app_private.inventory_cost_events e
    where (e.company_id,e.lot_id,e.variant_id)=(i.company_id,i.lot_id,i.variant_id) and e.previous_cost is null limit 1) first_value on true
   where dl.company_id=c and dl.document_id=doc
 ), weights as (select b.*,amount*100*b.merchandise/nullif(sum(b.merchandise) over(),0) as cents from base b),
 ranks as (select w.*,row_number() over(order by cents-floor(cents) desc,id) as pos,amount*100-sum(floor(cents)) over() as extras from weights w),
 allocations as (select r.*, (floor(cents)+case when pos<=extras then 1 else 0 end)/100 as fraction from ranks r)
 select id,a.name,lot,q,merchandise,round(fraction,2),round(fraction/q,4),price from allocations a order by id;
$$;
create function public.inventory_charge_preview(p_company uuid,p_document uuid,p_amount numeric) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d app_private.inventory_documents; split jsonb; posted numeric; shared numeric; bad boolean;
begin
 if not app_private.can_access(p_company,'inv-costos','read') then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into d from app_private.inventory_documents where company_id=p_company and id=p_document and kind='COMPRA';
 if not found or not app_private.inventory_document_visible(d) then raise exception 'permission_denied' using errcode='42501'; end if;
 if d.void_at is not null then raise exception 'inventory_already_void'; end if;
 if p_amount is null or p_amount<=0 or app_private.inventory_number(p_amount::text,2)<=0 then raise exception 'inventory_invalid_charge'; end if;
 select jsonb_agg(to_jsonb(x) order by x.variant_id),sum(x.share),round(sum(x.qty*x.unit_increment),2),
     bool_or(x.current_cost is null or x.base_value is null or x.share is null or round(x.qty*x.unit_increment,2)<>x.share)
 into split,shared,posted,bad from app_private.inventory_split_charge(p_company,p_document,p_amount) x;
 if exists(select from app_private.inventory_split_charge(p_company,p_document,p_amount) x where x.current_cost is null or x.base_value is null or x.share is null)
   then raise exception 'inventory_charge_needs_base_costs'; end if;
 if bad or shared is distinct from p_amount or posted is distinct from p_amount then raise exception 'inventory_charge_precision'; end if;
 return jsonb_build_object('stamp',md5(split::text),'lines',split);
end;
$$;
create function public.inventory_add_purchase_charge(p_company uuid,p_request uuid,p_document uuid,p_kind text,p_amount numeric,p_note text,p_stamp text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d app_private.inventory_documents; prior uuid; preview jsonb; x record;body jsonb:=jsonb_build_object('document',p_document,'kind',p_kind,'amount',p_amount,'note',p_note,'stamp',p_stamp);
begin
 if not app_private.can_access(p_company,'inv-costos','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if app_private.inventory_transition(p_company) is null then raise exception 'inventory_opening_required'; end if;
 prior:=app_private.inventory_replay(p_company,p_request,'CHARGE',body);
 select * into d from app_private.inventory_documents where company_id=p_company and id=p_document and kind='COMPRA' for share;
 if not found or not app_private.inventory_document_visible(d) then raise exception 'permission_denied' using errcode='42501'; end if;
 if prior is not null then return prior; end if;
 if p_kind is null or p_kind not in ('FLETE','ADUANA','OTRO') or coalesce(length(trim(p_note)),0) not between 1 and 2000 then raise exception 'inventory_reason_required'; end if;
 perform from app_private.inventory_lot_items i join app_private.inventory_lots l on (l.company_id,l.id)=(i.company_id,i.lot_id)
     where l.company_id=p_company and l.document_id=d.id order by i.lot_id,i.variant_id for update of i;
 preview:=public.inventory_charge_preview(p_company,p_document,p_amount);
 if p_stamp is distinct from preview->>'stamp' then raise exception 'inventory_charge_preview_changed'; end if;
 insert into app_private.inventory_purchase_charges(company_id,request_id,document_id,kind,amount,note,actor_id) values(p_company,p_request,d.id,p_kind,p_amount,trim(p_note),auth.uid());
 for x in select * from jsonb_to_recordset(preview->'lines') r(variant_id uuid,lot_id uuid,base_value numeric,share numeric,unit_increment numeric,current_cost numeric) order by lot_id,variant_id loop
    insert into app_private.inventory_charge_lines values(p_company,p_request,x.variant_id,x.base_value,x.share,x.unit_increment);
    if x.unit_increment>0 then
      insert into app_private.inventory_cost_events(company_id,request_id,lot_id,variant_id,actor_id,previous_cost,new_cost,reason)
       values(p_company,p_request,x.lot_id,x.variant_id,auth.uid(),x.current_cost,x.current_cost+x.unit_increment,p_kind||' · '||trim(p_note));
      update app_private.inventory_lot_items set unit_cost=x.current_cost+x.unit_increment where company_id=p_company and lot_id=x.lot_id and variant_id=x.variant_id;
    end if;
 end loop;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,document_id) values(p_company,p_request,auth.uid(),'CHARGE',body,d.id);
 return d.id;
end;
$$;
create function public.inventory_purchase_charges(p_company uuid,p_document uuid) returns table(id uuid,kind text,amount numeric,note text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'inv-costos','read') or not exists(select from app_private.inventory_documents d where d.company_id=p_company and d.id=p_document and app_private.inventory_document_visible(d))
 then raise exception 'permission_denied' using errcode='42501'; end if;
 return query select c.request_id,c.kind,c.amount,c.note,c.created_at from app_private.inventory_purchase_charges c
 where c.company_id=p_company and c.document_id=p_document order by c.created_at desc,c.request_id;
end;
$$;
revoke all on function app_private.inventory_split_charge(uuid,uuid,numeric),public.inventory_charge_preview(uuid,uuid,numeric),public.inventory_add_purchase_charge(uuid,uuid,uuid,text,numeric,text,text),
 public.inventory_purchase_charges(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.inventory_charge_preview(uuid,uuid,numeric),public.inventory_add_purchase_charge(uuid,uuid,uuid,text,numeric,text,text),
 public.inventory_purchase_charges(uuid,uuid) to authenticated;
commit;
