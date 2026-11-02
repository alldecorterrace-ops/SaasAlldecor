-- Store the product editor's display order separately from the variant's immutable option IDs.
begin;
alter table app_private.inventory_families add column attribute_layout jsonb;

create function app_private.inventory_validate_layout(layout jsonb, variants jsonb)
returns void language plpgsql set search_path='' as $$
declare axis jsonb; opt jsonb; line jsonb; allowed jsonb:='{}'; values_for_axis jsonb; attr text; val text; total int:=1;
begin
 if jsonb_typeof(layout) is distinct from 'array' or jsonb_array_length(layout)>6 then raise exception 'inventory_invalid_options'; end if;
 for axis in select value from jsonb_array_elements(layout) loop
   attr:=app_private.inventory_key(axis->>'name');
   if jsonb_typeof(axis->'name') is distinct from 'string' or length(trim(axis->>'name')) not between 1 and 100
     or attr='' or allowed ? attr or jsonb_typeof(axis->'values') is distinct from 'array'
     or jsonb_array_length(axis->'values') not between 1 and 200 then raise exception 'inventory_invalid_options'; end if;
   total:=total*jsonb_array_length(axis->'values');
   if total>200 then raise exception 'inventory_invalid_options'; end if;
   values_for_axis:='{}';
   for opt in select value from jsonb_array_elements(axis->'values') loop
     val:=app_private.inventory_key(opt#>>'{}');
     if jsonb_typeof(opt)<>'string' or length(trim(opt#>>'{}')) not between 1 and 100
       or val='' or values_for_axis ? val then raise exception 'inventory_invalid_options'; end if;
     values_for_axis:=values_for_axis||jsonb_build_object(val,true);
   end loop;
   allowed:=allowed||jsonb_build_object(attr,values_for_axis);
 end loop;
 for line in select value->'options' from jsonb_array_elements(variants) loop
   if jsonb_typeof(line) is distinct from 'object' or (select count(*) from jsonb_object_keys(line))<>jsonb_array_length(layout)
      or exists(select from jsonb_each_text(line) o where not coalesce(allowed->app_private.inventory_key(o.key) ? app_private.inventory_key(o.value),false))
   then raise exception 'inventory_invalid_options'; end if;
 end loop;
end;
$$;
revoke all on function app_private.inventory_validate_layout(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.inventory_save_family(p_company uuid,p_request uuid,p_id uuid,p_version int,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid:=coalesce(p_id,gen_random_uuid()); returned uuid; body jsonb:=jsonb_build_object('id',p_id,'version',p_version,'data',p_data);
 f app_private.inventory_families; existing app_private.inventory_variants; cat uuid; nm text:=trim(p_data->>'name'); cu app_private.inventory_unit:=(p_data->>'unit')::app_private.inventory_unit;
 num bigint; prefix text; code text; raw jsonb; opt record; aid uuid; oid uuid; ids uuid[]; opts uuid[]; attrs uuid[]; first_attrs uuid[];
 display text; key_base text; candidate text; serial int; vid uuid; line_price numeric; barcode text; seen uuid[]:='{}'; supplied uuid[];
 layout jsonb:=p_data->'attributeLayout';
 commercial_id uuid:=(p_data->>'commercialId')::uuid;
begin
 if not app_private.is_member(p_company) or not app_private.billing_writable(p_company) or
   not (app_private.can_access(p_company,'inv-catalogo','write') or (p_id is null and app_private.can_access(p_company,'inv-alta-productos','write'))) then
   raise exception 'permission_denied' using errcode='42501'; end if;
 if p_version is null or (p_id is null)<>(p_version=0) or jsonb_typeof(p_data->'variants') is distinct from 'array'
   or jsonb_array_length(p_data->'variants') not between 1 and 200 or coalesce(length(nm),0) not between 1 and 190 then raise exception 'inventory_invalid_product'; end if;
 perform app_private.inventory_transition(p_company); returned:=app_private.inventory_replay(p_company,p_request,'FAMILY',body); if returned is not null then return returned; end if;
 if layout is not null then perform app_private.inventory_validate_layout(layout,p_data->'variants'); end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-catalog:'||p_company::text,0));
 if p_data ? 'commercialId' then
   if not app_private.can_access(p_company,'productos','read') then raise exception 'permission_denied' using errcode='42501'; end if;
   if commercial_id is not null then
     perform from public.products where company_id=p_company and id=commercial_id and active for share;
     if not found then raise exception 'inventory_commercial_unavailable'; end if;
   end if;
 end if;
 if nullif(trim(p_data->>'category'),'') is not null then
   insert into app_private.inventory_categories(company_id,name) values(p_company,trim(p_data->>'category')) on conflict(company_id,name_key) do nothing;
   select id into strict cat from app_private.inventory_categories where company_id=p_company and name_key=app_private.inventory_key(p_data->>'category');
 end if;
 if p_id is null then
   insert into app_private.inventory_codes(company_id,last_number) values(p_company,1) on conflict(company_id) do update set last_number=inventory_codes.last_number+1 returning last_number into num;
   prefix:=left(upper(regexp_replace(app_private.inventory_words(nm),'[^a-z0-9]','','g')),3);
   code:=coalesce(nullif(prefix,''),'ART')||'-'||lpad(num::text,greatest(4,length(num::text)),'0');
   insert into app_private.inventory_families(company_id,id,code,name,category_id,unit,description,active,commercial_product_id,attribute_layout)
     values(p_company,result,code,nm,cat,cu,p_data->>'description',coalesce((p_data->>'active')::boolean,true),commercial_id,layout) returning * into f;
 else
   update app_private.inventory_families set name=nm,category_id=cat,description=p_data->>'description',active=coalesce((p_data->>'active')::boolean,true),version=version+1,
      attribute_layout=coalesce(layout,attribute_layout),
      commercial_product_id=case when p_data ? 'commercialId' then commercial_id else commercial_product_id end
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
   -- Presentation order affects the label only. The SKU and option set retain their canonical identity.
   if jsonb_array_length(f.attribute_layout)>0 then
     select coalesce(nm||' · '||string_agg(trim(opt_value),' · ' order by axis.pos nulls last, opt_key),display) into display
       from jsonb_each_text(raw->'options') o(opt_key,opt_value)
       left join jsonb_array_elements(f.attribute_layout) with ordinality axis(item,pos)
         on app_private.inventory_key(opt_key)=app_private.inventory_key(axis.item->>'name');
   end if;
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

create or replace function public.inventory_master_rows(p_company uuid,p_kind text,p_query text default '',p_id uuid default null,p_category uuid default null,p_only_active boolean default false)
returns table(id uuid,name text,data jsonb) language plpgsql stable security definer set search_path='' as $$
declare q text:=app_private.inventory_words(coalesce(p_query,'')); costs boolean:=app_private.can_access(p_company,'inv-costos','read');
 list_purchases boolean;
begin
 if p_kind is null or p_kind not in ('LOCATION','SUPPLIER','FAMILY') or not app_private.is_member(p_company) or
   (p_kind='LOCATION' and not app_private.is_manager(p_company)) or (p_kind='SUPPLIER' and not app_private.can_access(p_company,'inv-proveedores','read')) or
   (p_kind='FAMILY' and not (app_private.can_access(p_company,'inv-catalogo','read') or app_private.can_access(p_company,'inv-alta-productos','write') or app_private.can_access(p_company,'inv-precios','write'))) then
   raise exception 'permission_denied' using errcode='42501'; end if;
 if p_kind='LOCATION' then
   return query select l.id,l.name, jsonb_build_object('kind',l.kind,'city',l.city,'address',l.address,'active',l.active,'version',l.version)||
    case when costs then (select jsonb_build_object('value',b.known,'pending',b.pending) from app_private.inventory_balance(p_company,null,l.id) b) else '{}'::jsonb end
    from app_private.inventory_locations l where l.company_id=p_company and l.deleted_at is null and (p_id is null or l.id=p_id)
     and (not p_only_active or l.active) and strpos(app_private.inventory_words(l.name),q)>0 order by l.name,l.id;
 elsif p_kind='SUPPLIER' then
   list_purchases:=app_private.is_manager(p_company) or exists(select from app_private.inventory_location_access a where a.company_id=p_company and a.user_id=auth.uid() and a.actions&&array['purchases.create','purchases.void']);
   return query select s.id,s.name,jsonb_build_object('tax_identifier',s.tax_identifier,'phone',s.phone,'email',s.email,'address',s.address,'notes',s.notes,'active',s.active,'version',s.version)||
    case when list_purchases then jsonb_build_object('purchases',(select count(*) from app_private.inventory_documents d where d.company_id=p_company and d.supplier_id=s.id and app_private.inventory_document_visible(d))) else '{}' end||
    case when costs and list_purchases then (select jsonb_build_object('total',coalesce(sum(dl.quantity*i.unit_cost),0),'pending',coalesce(sum(dl.quantity) filter(where i.unit_cost is null),0)) from app_private.inventory_documents d
       join app_private.inventory_document_lines dl on (dl.company_id,dl.document_id)=(d.company_id,d.id)
       join app_private.inventory_lots l on (l.company_id,l.document_id)=(d.company_id,d.id)
       join app_private.inventory_lot_items i on (i.company_id,i.lot_id,i.variant_id)=(l.company_id,l.id,dl.variant_id)
       where d.company_id=p_company and d.supplier_id=s.id and d.void_at is null and app_private.inventory_document_visible(d)) else '{}' end
   from app_private.inventory_suppliers s where s.company_id=p_company and (p_id is null or s.id=p_id) and (not p_only_active or s.active) and strpos(app_private.inventory_words(s.name),q)>0 order by s.name,s.id;
 else
   return query select f.id,f.name,jsonb_build_object('code',f.code,'attributeLayout',f.attribute_layout,'category',cat.name,'categoryId',cat.id,'unit',f.unit,'description',f.description,'active',f.active,'version',f.version,
     'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'sku',v.sku,'barcode',v.barcode,'price',v.sale_price,'active',v.active,
       'options',coalesce((select jsonb_object_agg(a.name,o.name) from app_private.inventory_variant_options x
         join app_private.inventory_attributes a on (a.company_id,a.id)=(x.company_id,x.attribute_id) join app_private.inventory_attribute_options o on (o.company_id,o.id)=(x.company_id,x.option_id)
         where x.company_id=v.company_id and x.variant_id=v.id),'{}'))||
       case when costs then (select jsonb_build_object('lastCost',app_private.inventory_last_cost(p_company,v.id,null),'average',b.known/nullif(b.qty-b.pending,0),'pending',b.pending)
         from app_private.inventory_balance(p_company,v.id,null)b) else '{}' end order by v.sku) from app_private.inventory_variants v where v.company_id=p_company and v.family_id=f.id),'[]'))
   ||case when app_private.can_access(p_company,'productos','read') and f.commercial_product_id is not null then
       jsonb_build_object('commercial',jsonb_build_object('id',f.commercial_product_id,'name',cp.name)) else '{}' end
   from app_private.inventory_families f left join app_private.inventory_categories cat on (cat.company_id,cat.id)=(f.company_id,f.category_id)
   left join public.products cp on (cp.company_id,cp.id)=(f.company_id,f.commercial_product_id)
   where f.company_id=p_company and (p_id is null or f.id=p_id) and (p_category is null or f.category_id=p_category) and (not p_only_active or f.active)
       and app_private.inventory_family_matches(p_company,f.id,coalesce(p_query,'')) order by f.name,f.id;
 end if;
end;
$$;

commit;
