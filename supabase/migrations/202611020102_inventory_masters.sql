begin;
alter table app_private.inventory_requests alter column document_id drop not null, add column entity_id uuid,
 add check(num_nonnulls(document_id,entity_id)=1);
create or replace function app_private.inventory_replay(p_company uuid,p_request uuid,p_op text,p_payload jsonb) returns uuid
language plpgsql set search_path='' as $$
declare receipt app_private.inventory_requests;
begin
 if p_request is null or p_payload is null or octet_length(p_payload::text)>200000 then raise exception 'inventory_invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-request:'||p_company::text||':'||p_request::text,0));
 select * into receipt from app_private.inventory_requests where company_id=p_company and request_id=p_request;
 if found then
   if (receipt.actor_id,receipt.operation,receipt.payload) is distinct from (auth.uid(),p_op,p_payload)
     then raise exception 'inventory_request_conflict' using errcode='23505'; end if;
   return coalesce(receipt.document_id,receipt.entity_id);
 end if;
 return null;
end;
$$;
alter table app_private.inventory_locations add column version integer not null default 1;
alter table app_private.inventory_suppliers add column version integer not null default 1;
alter table app_private.inventory_families add column version integer not null default 1;
create table app_private.inventory_codes(company_id uuid primary key references public.companies(id),last_number bigint not null);
alter table app_private.inventory_codes enable row level security;
revoke all on app_private.inventory_codes from public,anon,authenticated,service_role;

create function app_private.inventory_words(s text) returns text language sql immutable strict set search_path='' as $$
 select translate(lower(trim(s)),'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun');
$$;
create function app_private.inventory_has_location_role(c uuid,l uuid,action text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.is_member(c) and (app_private.is_manager(c) or exists(select from app_private.inventory_location_access a
 where a.company_id=c and a.location_id=l and a.user_id=auth.uid() and (action='stock.view' or action=any(a.actions))));
$$;
create function app_private.inventory_document_visible(d app_private.inventory_documents) returns boolean language sql stable set search_path='' as $$
 select case when app_private.is_manager(d.company_id) then true
   when d.kind='COMPRA' then app_private.inventory_has_location_role(d.company_id,d.location_id,'purchases.create') or app_private.inventory_has_location_role(d.company_id,d.location_id,'purchases.void')
   when d.kind='AJUSTE' then app_private.inventory_has_location_role(d.company_id,d.location_id,'adjustments.create')
   when d.kind='TRASLADO' then (app_private.inventory_has_location_role(d.company_id,d.location_id,'transfers.create') or app_private.inventory_has_location_role(d.company_id,d.location_id,'transfers.void'))
      and (app_private.inventory_has_location_role(d.company_id,d.destination_id,'transfers.create') or app_private.inventory_has_location_role(d.company_id,d.destination_id,'transfers.void'))
   else false end;
$$;
create function public.inventory_context(p_company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare locations jsonb;
begin
 if not app_private.is_member(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'kind',l.kind,'active',l.active,'actions',
    (select coalesce(jsonb_agg(a),'[]') from unnest(array['purchases.create','purchases.void','transfers.create','transfers.void','adjustments.create']) a
       where app_private.inventory_has_location_role(p_company,l.id,a))) order by l.name,l.id),'[]') into locations
 from app_private.inventory_locations l where l.company_id=p_company and l.deleted_at is null and app_private.inventory_has_location_role(p_company,l.id,'stock.view');
 return jsonb_build_object('active',public.inventory_is_active(p_company),'manager',app_private.is_manager(p_company),'writable',app_private.billing_writable(p_company),
   'supplierView',app_private.can_access(p_company,'inv-proveedores','read'),'supplierManage',app_private.can_access(p_company,'inv-proveedores','write'),
   'catalogView',app_private.can_access(p_company,'inv-catalogo','read'),'catalogManage',app_private.can_access(p_company,'inv-catalogo','write'),
   'productCreate',app_private.can_access(p_company,'inv-alta-productos','write') or app_private.can_access(p_company,'inv-catalogo','write'),
   'priceManage',app_private.can_access(p_company,'inv-precios','write'),
   'costView',app_private.can_access(p_company,'inv-costos','read'),'costManage',app_private.can_access(p_company,'inv-costos','write'),'locations',locations);
end;
$$;
create function public.inventory_location_team(p_company uuid,p_location uuid) returns table(user_id uuid,email text,assigned boolean,actions text[])
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.is_manager(p_company) or not exists(select from app_private.inventory_locations where company_id=p_company and id=p_location and deleted_at is null)
 then raise exception 'permission_denied' using errcode='42501'; end if;
 return query select m.user_id,m.email,s.user_id is not null,coalesce(s.actions,'{}')
 from public.memberships m left join app_private.inventory_location_access s on (s.company_id,s.user_id)=(m.company_id,m.user_id) and s.location_id=p_location
 where m.company_id=p_company and m.active and m.role='member' order by m.email,m.user_id;
end;
$$;

create function public.inventory_save_master(p_company uuid,p_request uuid,p_kind text,p_id uuid,p_version int,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare body jsonb:=jsonb_build_object('kind',p_kind,'id',p_id,'version',p_version,'data',p_data); prior uuid;
 result uuid:=coalesce(p_id,gen_random_uuid()); nm text:=trim(p_data->>'name'); changed int; enabled boolean:=coalesce((p_data->>'active')::boolean,true);
begin
 if not app_private.is_member(p_company) or not app_private.billing_writable(p_company) or
   (p_kind='LOCATION' and not app_private.is_manager(p_company)) or
   (p_kind='SUPPLIER' and not app_private.can_access(p_company,'inv-proveedores','write')) or
   (p_kind='OPTION' and not app_private.can_access(p_company,'inv-catalogo','write')) then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('LOCATION','SUPPLIER','OPTION') or jsonb_typeof(p_data) is distinct from 'object' or
    p_version is null or (p_id is null)<>(p_version=0) then raise exception 'inventory_invalid_request'; end if;
 perform app_private.inventory_transition(p_company);
 prior:=app_private.inventory_replay(p_company,p_request,'MASTER',body); if prior is not null then return prior; end if;
 if p_kind='LOCATION' then
   if p_id is null then
     insert into app_private.inventory_locations(company_id,id,kind,name,city,address,active) values(p_company,result,p_data->>'kind',nm,coalesce(p_data->>'city',''),coalesce(p_data->>'address',''),enabled);
   else
     update app_private.inventory_locations set name=nm,city=coalesce(p_data->>'city',''),address=coalesce(p_data->>'address',''),active=enabled and not coalesce((p_data->>'remove')::boolean,false),
       deleted_at=case when coalesce((p_data->>'remove')::boolean,false) then now() end,version=version+1
       where company_id=p_company and id=p_id and version=p_version and deleted_at is null and kind=p_data->>'kind';
     get diagnostics changed=row_count;
   end if;
 elsif p_kind='SUPPLIER' then
   if p_id is null then
     insert into app_private.inventory_suppliers(company_id,id,name,tax_identifier,phone,email,address,notes,active)
       values(p_company,result,nm,p_data->>'tax_identifier',p_data->>'phone',p_data->>'email',p_data->>'address',p_data->>'notes',enabled);
   else
     update app_private.inventory_suppliers set name=nm,tax_identifier=p_data->>'tax_identifier',phone=p_data->>'phone',email=p_data->>'email',address=p_data->>'address',notes=p_data->>'notes',
       active=enabled,version=version+1 where company_id=p_company and id=p_id and version=p_version;
     get diagnostics changed=row_count;
   end if;
 else
   update app_private.inventory_attribute_options set active=enabled where company_id=p_company and id=p_id;
   get diagnostics changed=row_count;
 end if;
 if changed=0 then raise exception 'inventory_revision_conflict' using errcode='PT409'; end if;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,entity_id) values(p_company,p_request,auth.uid(),'MASTER',body,result);
 return result;
end;
$$;

create function public.inventory_save_family(p_company uuid,p_request uuid,p_id uuid,p_version int,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid:=coalesce(p_id,gen_random_uuid()); returned uuid; body jsonb:=jsonb_build_object('id',p_id,'version',p_version,'data',p_data);
 f app_private.inventory_families; existing app_private.inventory_variants; cat uuid; nm text:=trim(p_data->>'name'); cu app_private.inventory_unit:=(p_data->>'unit')::app_private.inventory_unit;
 num bigint; prefix text; code text; raw jsonb; opt record; aid uuid; oid uuid; ids uuid[]; opts uuid[]; attrs uuid[]; first_attrs uuid[];
 display text; key_base text; candidate text; serial int; vid uuid; line_price numeric; barcode text; seen uuid[]:='{}'; supplied uuid[];
begin
 if not app_private.is_member(p_company) or not app_private.billing_writable(p_company) or
   not (app_private.can_access(p_company,'inv-catalogo','write') or (p_id is null and app_private.can_access(p_company,'inv-alta-productos','write'))) then
   raise exception 'permission_denied' using errcode='42501'; end if;
 if p_version is null or (p_id is null)<>(p_version=0) or jsonb_typeof(p_data->'variants') is distinct from 'array'
   or jsonb_array_length(p_data->'variants') not between 1 and 200 or coalesce(length(nm),0) not between 1 and 190 then raise exception 'inventory_invalid_product'; end if;
 perform app_private.inventory_transition(p_company); returned:=app_private.inventory_replay(p_company,p_request,'FAMILY',body); if returned is not null then return returned; end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-catalog:'||p_company::text,0));
 if nullif(trim(p_data->>'category'),'') is not null then
   insert into app_private.inventory_categories(company_id,name) values(p_company,trim(p_data->>'category')) on conflict(company_id,name_key) do nothing;
   select id into strict cat from app_private.inventory_categories where company_id=p_company and name_key=app_private.inventory_key(p_data->>'category');
 end if;
 if p_id is null then
   insert into app_private.inventory_codes(company_id,last_number) values(p_company,1) on conflict(company_id) do update set last_number=inventory_codes.last_number+1 returning last_number into num;
   prefix:=left(upper(regexp_replace(app_private.inventory_words(nm),'[^a-z0-9]','','g')),3);
   code:=coalesce(nullif(prefix,''),'ART')||'-'||lpad(num::text,greatest(4,length(num::text)),'0');
   insert into app_private.inventory_families(company_id,id,code,name,category_id,unit,description,active)
     values(p_company,result,code,nm,cat,cu,p_data->>'description',coalesce((p_data->>'active')::boolean,true)) returning * into f;
 else
   update app_private.inventory_families set name=nm,category_id=cat,description=p_data->>'description',active=coalesce((p_data->>'active')::boolean,true),version=version+1
     where company_id=p_company and id=p_id and unit=cu and version=p_version returning * into f;
   if not found then raise exception 'inventory_revision_conflict' using errcode='PT409'; end if;
 end if;
 for raw in select value from jsonb_array_elements(p_data->'variants') loop
   if jsonb_typeof(raw->'options') is distinct from 'object' or (select count(*) from jsonb_object_keys(raw->'options'))>6 then raise exception 'inventory_invalid_options'; end if;
   existing:=null; vid:=nullif(raw->>'id','')::uuid;
   if vid is not null then
     select * into existing from app_private.inventory_variants where company_id=p_company and id=vid and family_id=result for update;
     if not found then raise exception 'inventory_variant_unavailable'; end if;
   end if;
   opts:='{}'; attrs:='{}'; display:=nm; key_base:=f.code;
   for opt in select key,val from jsonb_each_text(raw->'options') as x(key,val) order by key loop
     if length(trim(opt.key)) not between 1 and 100 or coalesce(length(trim(opt.val)),0) not between 1 and 100 then raise exception 'inventory_invalid_options'; end if;
     insert into app_private.inventory_attributes(company_id,name) values(p_company,trim(opt.key)) on conflict(company_id,name_key) do nothing;
     select id into strict aid from app_private.inventory_attributes where company_id=p_company and name_key=app_private.inventory_key(opt.key);
     insert into app_private.inventory_family_attributes values(p_company,result,aid) on conflict do nothing;
     insert into app_private.inventory_attribute_options(company_id,attribute_id,name) values(p_company,aid,trim(opt.val)) on conflict(company_id,attribute_id,name_key) do nothing;
     select o.id into oid from app_private.inventory_attribute_options o where o.company_id=p_company and o.attribute_id=aid and o.name_key=app_private.inventory_key(opt.val)
       and (o.active or o.id=any(existing.option_ids));
     if not found or aid=any(attrs) then raise exception 'inventory_option_unavailable'; end if;
     opts:=array_append(opts,oid);attrs:=array_append(attrs,aid);display:=display||' · '||trim(opt.val);
     key_base:=key_base||'-'||left(coalesce(nullif(regexp_replace(upper(app_private.inventory_words(opt.val)),'[^A-Z0-9]','','g'),''),'OP'),5);
   end loop;
   ids:=array(select x from unnest(opts) x order by x);attrs:=array(select x from unnest(attrs) x order by x);
   if first_attrs is null then first_attrs:=attrs; elsif first_attrs<>attrs then raise exception 'inventory_inconsistent_attributes'; end if;
   if raw ? 'price' and not app_private.can_access(p_company,'inv-precios','write') then raise exception 'permission_denied' using errcode='42501'; end if;
   line_price:=case when raw->>'price' is not null then app_private.inventory_number(raw->>'price',2) end;
   barcode:=nullif(trim(raw->>'barcode'),'');
   if existing.id is not null then
     if ids<>existing.option_ids then raise exception 'inventory_variant_identity_locked'; end if;
     update app_private.inventory_variants set name=display,barcode=barcode_value.b,active=coalesce((raw->>'active')::boolean,true),
       sale_price=case when raw ? 'price' then line_price else sale_price end from (select nullif(trim(raw->>'barcode'),'') as b) barcode_value
       where company_id=p_company and id=vid;
   else
     vid:=gen_random_uuid();candidate:=key_base;serial:=1;
     while exists(select from app_private.inventory_variants where company_id=p_company and sku_key=app_private.inventory_key(candidate)) loop
       serial:=serial+1;candidate:=key_base||'-'||serial; end loop;
     insert into app_private.inventory_variants(company_id,id,family_id,unit,sku,name,barcode,sale_price,active,option_ids)
       values(p_company,vid,result,cu,candidate,display,barcode,line_price,coalesce((raw->>'active')::boolean,true),ids);
     insert into app_private.inventory_variant_options(company_id,variant_id,family_id,attribute_id,option_id)
       select p_company,vid,result,o.attribute_id,o.id from app_private.inventory_attribute_options o where o.company_id=p_company and o.id=any(ids);
   end if;
   if vid=any(seen) then raise exception 'inventory_duplicate_variant'; end if;
   seen:=array_append(seen,vid);
 end loop;
 select array_agg(id) into supplied from app_private.inventory_variants where company_id=p_company and family_id=result and not(id=any(seen));
 if supplied is not null then raise exception 'inventory_keep_existing_variants'; end if;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,entity_id) values(p_company,p_request,auth.uid(),'FAMILY',body,result);
 return result;
end;
$$;
create function public.inventory_set_price(p_company uuid,p_request uuid,p_variant uuid,p_price numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare body jsonb:=jsonb_build_object('variant',p_variant,'price',p_price); previous uuid;
begin
 if not app_private.can_access(p_company,'inv-precios','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 previous:=app_private.inventory_replay(p_company,p_request,'PRICE',body); if previous is not null then return previous; end if;
 if p_price is not null and (p_price<>round(p_price,2) or p_price<0 or p_price::text in ('NaN','Infinity','-Infinity')) then raise exception 'inventory_invalid_price'; end if;
 update app_private.inventory_families set version=version+1 where company_id=p_company and id=(
   select family_id from app_private.inventory_variants where company_id=p_company and id=p_variant);
 update app_private.inventory_variants set sale_price=p_price where company_id=p_company and id=p_variant;
 if not found then raise exception 'inventory_variant_unavailable'; end if;
 insert into app_private.inventory_requests(company_id,request_id,actor_id,operation,payload,entity_id) values(p_company,p_request,auth.uid(),'PRICE',body,p_variant);
 return p_variant;
end;
$$;
revoke all on function app_private.inventory_words(text),app_private.inventory_has_location_role(uuid,uuid,text),app_private.inventory_document_visible(app_private.inventory_documents),
 public.inventory_context(uuid),public.inventory_location_team(uuid,uuid),public.inventory_save_master(uuid,uuid,text,uuid,int,jsonb),
 public.inventory_save_family(uuid,uuid,uuid,int,jsonb),public.inventory_set_price(uuid,uuid,uuid,numeric) from public,anon,authenticated,service_role;
grant execute on function public.inventory_context(uuid),public.inventory_location_team(uuid,uuid),public.inventory_save_master(uuid,uuid,text,uuid,int,jsonb),
 public.inventory_save_family(uuid,uuid,uuid,int,jsonb),public.inventory_set_price(uuid,uuid,uuid,numeric) to authenticated;
commit;
