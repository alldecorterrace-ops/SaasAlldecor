begin;
create function app_private.inventory_lot_label(l app_private.inventory_lots,d app_private.inventory_documents) returns text language sql stable set search_path='' as $$
 select case when l.kind='ANTERIOR' then 'Existencias anteriores' else
 (case l.kind when 'COMPRA' then 'Compra del ' when 'INICIAL' then 'Inventario inicial del ' else 'Sobrante del ' end)||to_char(d.business_date,'DD/MM/YYYY')||' · '||
 (select count(*) from app_private.inventory_lots x join app_private.inventory_documents h on (h.company_id,h.id)=(x.company_id,x.document_id)
  where x.company_id=l.company_id and x.kind=l.kind and h.business_date=d.business_date and (h.created_at,x.id)<=(d.created_at,l.id))::text end;
$$;
create function app_private.inventory_balance(c uuid,v uuid,loc uuid) returns table(qty numeric,known numeric,pending numeric)
language sql stable set search_path='' as $$
 select coalesce(sum(s.quantity),0),coalesce(sum(s.quantity*i.unit_cost),0),coalesce(sum(s.quantity) filter(where i.unit_cost is null),0)
 from app_private.inventory_lot_levels s join app_private.inventory_lot_items i using(company_id,lot_id,variant_id)
 where s.company_id=c and (v is null or s.variant_id=v) and (loc is null or s.location_id=loc) and app_private.inventory_location_allowed(c,s.location_id,'stock.view');
$$;
create function app_private.inventory_family_matches(c uuid,f uuid,needle text) returns boolean language sql stable set search_path='' as $$
 select exists(select from app_private.inventory_families h where h.company_id=c and h.id=f and (
   needle='' or strpos(app_private.inventory_words(h.name||' '||h.code),app_private.inventory_words(needle))>0 or exists(
    select from app_private.inventory_variants v where v.company_id=c and v.family_id=f and
    (v.barcode=needle or strpos(app_private.inventory_words(v.name||' '||v.sku),app_private.inventory_words(needle))>0))));
$$;
create function app_private.inventory_last_cost(c uuid,v uuid,s uuid) returns numeric language sql stable set search_path='' as $$
 select i.unit_cost from app_private.inventory_lot_items i join app_private.inventory_lots l on (l.company_id,l.id)=(i.company_id,i.lot_id)
 join app_private.inventory_documents d on (d.company_id,d.id)=(l.company_id,l.document_id)
 where i.company_id=c and i.variant_id=v and l.kind='COMPRA' and d.void_at is null and (s is null or d.supplier_id=s)
 and app_private.inventory_document_visible(d) order by d.business_date desc,d.created_at desc,d.id desc limit 1;
$$;
create function public.inventory_search_variants(p_company uuid,p_query text,p_location uuid default null,p_supplier uuid default null)
returns table(id uuid,name text,sku text,unit text,available numeric,extra jsonb) language plpgsql stable security definer set search_path='' as $$
declare needle text:=trim(coalesce(p_query,'')); show_cost boolean:=app_private.can_access(p_company,'inv-costos','write');
begin
 if not app_private.is_member(p_company) or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view')) or
  (p_location is null and not app_private.can_access(p_company,'inv-catalogo','read')) then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_supplier is not null and not app_private.can_access(p_company,'inv-proveedores','read') then raise exception 'permission_denied' using errcode='42501'; end if;
 if length(needle)>150 then raise exception 'inventory_invalid_query'; end if;
 return query select v.id,v.name,v.sku,v.unit::text,case when p_location is not null then coalesce(b.quantity,0)::numeric end,
 case when show_cost then jsonb_build_object('suggested',app_private.inventory_last_cost(p_company,v.id,p_supplier)) else '{}'::jsonb end
 from app_private.inventory_variants v join app_private.inventory_families f on (f.company_id,f.id)=(v.company_id,v.family_id)
 left join app_private.inventory_levels b on b.company_id=v.company_id and b.variant_id=v.id and b.location_id=p_location
 where v.company_id=p_company and v.active and f.active and (v.barcode=needle or strpos(app_private.inventory_words(v.sku||' '||v.name||' '||f.code),app_private.inventory_words(needle))>0)
 order by (v.barcode is not distinct from needle) desc,v.name,v.id limit 20;
end;
$$;

create function public.inventory_master_rows(p_company uuid,p_kind text,p_query text default '',p_id uuid default null,p_category uuid default null,p_only_active boolean default false)
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
   return query select f.id,f.name,jsonb_build_object('code',f.code,'category',cat.name,'categoryId',cat.id,'unit',f.unit,'description',f.description,'active',f.active,'version',f.version,
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

create function public.inventory_catalog_choices(p_company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (app_private.can_access(p_company,'inv-catalogo','read') or app_private.can_access(p_company,'inv-alta-productos','write') or app_private.can_access(p_company,'inv-precios','write'))
 then raise exception 'permission_denied' using errcode='42501'; end if;
 return jsonb_build_object('categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from app_private.inventory_categories where company_id=p_company),
 'attributes',(select coalesce(jsonb_agg(jsonb_build_object('name',a.name,'options',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'active',o.active) order by o.name),'[]')
 from app_private.inventory_attribute_options o where o.company_id=p_company and o.attribute_id=a.id)) order by a.name),'[]') from app_private.inventory_attributes a where a.company_id=p_company));
end;
$$;

create function public.inventory_remaining_lots(p_company uuid,p_variant uuid default null,p_location uuid default null,p_document uuid default null,p_supplier uuid default null)
returns table(lot_id uuid,variant_id uuid,location_id uuid,quantity numeric,label text,detail jsonb) language plpgsql stable security definer set search_path='' as $$
declare d app_private.inventory_documents;
begin
 if not app_private.is_member(p_company) or (p_location is not null and not app_private.inventory_location_allowed(p_company,p_location,'stock.view')) or
   (p_supplier is not null and not app_private.can_access(p_company,'inv-proveedores','read')) then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_document is not null then
   select * into d from app_private.inventory_documents where company_id=p_company and id=p_document;
   if not found or not app_private.inventory_document_visible(d) then raise exception 'permission_denied' using errcode='42501'; end if;
 end if;
 return query select s.lot_id,s.variant_id,s.location_id,s.quantity::numeric,app_private.inventory_lot_label(l,h),
   jsonb_build_object('location',loc.name,'product',v.name,'sku',v.sku,'date',h.business_date)||
   case when app_private.inventory_document_visible(h) then jsonb_build_object('document',h.id,'documentKind',h.kind) else '{}' end||
   case when app_private.can_access(p_company,'inv-proveedores','read') then jsonb_build_object('supplier',sup.name) else '{}' end||
   case when app_private.can_access(p_company,'inv-costos','read') then jsonb_build_object('unitCost',i.unit_cost,'value',s.quantity*i.unit_cost) else '{}' end
 from app_private.inventory_lot_levels s join app_private.inventory_lot_items i using(company_id,lot_id,variant_id)
 join app_private.inventory_lots l on (l.company_id,l.id)=(s.company_id,s.lot_id)
 join app_private.inventory_documents h on (h.company_id,h.id)=(l.company_id,l.document_id)
 join app_private.inventory_locations loc on (loc.company_id,loc.id)=(s.company_id,s.location_id)
 join app_private.inventory_variants v on (v.company_id,v.id)=(s.company_id,s.variant_id)
 left join app_private.inventory_suppliers sup on (sup.company_id,sup.id)=(h.company_id,h.supplier_id)
 where s.company_id=p_company and s.quantity>0 and app_private.inventory_location_allowed(p_company,s.location_id,'stock.view')
   and (p_variant is null or s.variant_id=p_variant) and (p_location is null or s.location_id=p_location)
   and (p_document is null or h.id=p_document) and (p_supplier is null or h.supplier_id=p_supplier)
 order by h.business_date desc,h.created_at desc,s.lot_id,s.variant_id,s.location_id;
end;
$$;
create function public.inventory_document_rows(p_company uuid,p_kind text,p_id uuid default null,p_from date default null,p_to date default null,
 p_location uuid default null,p_supplier uuid default null,p_state text default null,p_pending boolean default false,p_query text default '',p_reason text default null)
returns table(id uuid,business_date date,data jsonb) language plpgsql stable security definer set search_path='' as $$
declare costs boolean:=app_private.can_access(p_company,'inv-costos','read'); providers boolean:=app_private.can_access(p_company,'inv-proveedores','read');
begin
 if not app_private.is_member(p_company) or p_kind not in ('COMPRA','TRASLADO','AJUSTE') or (p_supplier is not null and not providers) or (p_pending and not costs) or
   (p_location is not null and not app_private.inventory_has_location_role(p_company,p_location,'stock.view')) then raise exception 'permission_denied' using errcode='42501'; end if;
 return query select d.id,d.business_date,jsonb_build_object('kind',d.kind,'location',a.name,'locationId',a.id,'destination',b.name,'destinationId',b.id,'notes',d.notes,'reason',d.adjustment_reason,
   'void',d.void_at is not null,'voidReason',d.void_reason,'voidAt',d.void_at,
   'voidBy',(select email from public.memberships where company_id=d.company_id and user_id=d.void_by),
   'actor',(select email from public.memberships where company_id=d.company_id and user_id=d.created_by),'lotId',lot.id,'lines',coalesce(lines.rows,'[]'))||
   case when providers then jsonb_build_object('supplier',s.name,'supplierId',s.id,'reference',d.supplier_reference) else '{}' end||
   case when costs then jsonb_build_object('value',lines.known,'pending',lines.pending,'tax',d.tax_usd) else '{}' end
 from app_private.inventory_documents d join app_private.inventory_locations a on (a.company_id,a.id)=(d.company_id,d.location_id)
 left join app_private.inventory_locations b on (b.company_id,b.id)=(d.company_id,d.destination_id)
 left join app_private.inventory_suppliers s on (s.company_id,s.id)=(d.company_id,d.supplier_id)
 left join app_private.inventory_lots lot on (lot.company_id,lot.document_id)=(d.company_id,d.id)
 cross join lateral (select jsonb_agg(jsonb_build_object('variant',v.id,'name',v.name,'sku',v.sku,'unit',v.unit,'qty',dl.quantity)||
    case when costs then jsonb_build_object('unitCost',case when i.lot_id is not null then i.unit_cost else abs(m.known/nullif(dl.quantity,0)) end,'value',case when d.kind='COMPRA' then dl.quantity*i.unit_cost else m.known end,'pending',m.pending) else '{}' end order by v.name,dl.id) rows,
    coalesce(sum(case when d.kind='COMPRA' then dl.quantity*i.unit_cost else m.known end),0) known,
    coalesce(sum(case when d.kind='COMPRA' then case when i.unit_cost is null then dl.quantity else 0 end else m.pending end),0) pending
   from app_private.inventory_document_lines dl join app_private.inventory_variants v on (v.company_id,v.id)=(dl.company_id,dl.variant_id)
   left join app_private.inventory_lot_items i on (i.company_id,i.lot_id,i.variant_id)=(dl.company_id,lot.id,dl.variant_id)
   left join lateral(select sum((case when d.kind='TRASLADO' then abs(p.quantity) else p.quantity end)*coalesce(p.unit_cost,av.unit_cost)) known,
     coalesce(sum(abs(p.quantity)) filter(where coalesce(p.unit_cost,av.unit_cost) is null),0) pending
     from app_private.inventory_ledger k join app_private.inventory_ledger_parts p on (p.company_id,p.movement_id)=(k.company_id,k.id)
     left join app_private.inventory_part_valuations av on (av.company_id,av.movement_id,av.lot_id)=(p.company_id,p.movement_id,p.lot_id)
     where k.company_id=dl.company_id and k.line_id=dl.id and k.reversal_of is null and k.kind<>'TRASLADO_ENTRADA') m on true
   where dl.company_id=p_company and dl.document_id=d.id) lines
 where d.company_id=p_company and d.kind=p_kind and app_private.inventory_document_visible(d) and (p_id is null or d.id=p_id)
   and (p_from is null or d.business_date>=p_from) and (p_to is null or d.business_date<=p_to)
   and (p_location is null or p_location in (d.location_id,d.destination_id)) and (p_supplier is null or d.supplier_id=p_supplier)
   and (p_state is null or (d.void_at is not null)=(p_state='ANULADO')) and (not p_pending or lines.pending>0)
   and (p_reason is null or p_reason=d.adjustment_reason) and (coalesce(p_query,'')='' or exists(select from app_private.inventory_document_lines x
     join app_private.inventory_variants v on (v.company_id,v.id)=(x.company_id,x.variant_id)
     where x.company_id=p_company and x.document_id=d.id and (v.barcode=p_query or strpos(app_private.inventory_words(v.sku||' '||v.name),app_private.inventory_words(p_query))>0)))
 order by d.business_date desc,d.created_at desc,d.id;
end;
$$;
revoke all on function app_private.inventory_lot_label(app_private.inventory_lots,app_private.inventory_documents),app_private.inventory_balance(uuid,uuid,uuid),
 app_private.inventory_family_matches(uuid,uuid,text),app_private.inventory_last_cost(uuid,uuid,uuid),public.inventory_catalog_choices(uuid),public.inventory_search_variants(uuid,text,uuid,uuid),
 public.inventory_master_rows(uuid,text,text,uuid,uuid,boolean),public.inventory_remaining_lots(uuid,uuid,uuid,uuid,uuid),
 public.inventory_document_rows(uuid,text,uuid,date,date,uuid,uuid,text,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.inventory_catalog_choices(uuid),public.inventory_search_variants(uuid,text,uuid,uuid),public.inventory_master_rows(uuid,text,text,uuid,uuid,boolean),
 public.inventory_remaining_lots(uuid,uuid,uuid,uuid,uuid),public.inventory_document_rows(uuid,text,uuid,date,date,uuid,uuid,text,boolean,text,text) to authenticated;
commit;
