-- Additive functions only. Saved designs, prices and estimates are not rewritten.
-- Legacy single-wall payloads retain their former calculation and validation.
begin;
CREATE OR REPLACE FUNCTION public.save_design(p_company uuid, p_id uuid, p_version integer, p_kind text, p_data jsonb, p_refresh boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare oldrow public.designs;book public.price_books;r jsonb;s jsonb;cid uuid;k text;v numeric;total numeric:=0;items jsonb:='[]';line jsonb;roof text;wall text;rate numeric;qty numeric;label text;basis text;l numeric;w numeric;h numeric;pv integer;extended boolean;roof_enabled boolean:=true;walls jsonb:='[]';wall_item jsonb;wall_label text;wall_color text;wall_details text:='';wall_total numeric:=0;wall_area numeric:=0;wall_index integer:=0;permit_area numeric;
begin
 if p_kind not in ('nuevo3d','pergolamotor') or p_kind is null or not app_private.can_access(p_company,p_kind,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_refresh is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'invalid_design';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into oldrow from public.designs where company_id=p_company and id=p_id for update;
 if coalesce(oldrow.version,0)<>p_version or (oldrow.id is not null and oldrow.kind<>p_kind) then raise exception 'record_conflict' using errcode='PT409';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 160 then raise exception 'invalid_name';end if;
 cid:=(p_data->>'customer_id')::uuid;
 if oldrow.id is null or oldrow.customer_id<>cid then
  if not app_private.can_access(p_company,'clientes','read') or not exists(select 1 from public.customers where company_id=p_company and id=cid and status='active') then raise exception 'customer_unavailable';end if;
 end if;
 s:=p_data->'spec';if s is null or jsonb_typeof(s)<>'object' then raise exception 'invalid_spec';end if;
 extended:=s ? 'walls';
 if oldrow.spec ? 'walls' and not extended then raise exception 'design_client_outdated';end if;
 if extended then
  if jsonb_typeof(s->'walls') is distinct from 'array' or jsonb_typeof(s->'roof_enabled') is distinct from 'boolean' then raise exception 'invalid_walls';end if;
  if jsonb_array_length(s->'walls')>10 then raise exception 'too_many_walls';end if;
  roof_enabled:=(s->>'roof_enabled')::boolean;
 end if;
 foreach k in array array['length','width','height','wall_length','wall_height','kitchen_length','heavy_count'] loop
  if coalesce(s->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' then raise exception 'invalid_dimension';end if;
  v:=(s->>k)::numeric;if v>200 or (roof_enabled and k in ('length','width','height') and v<=0) or (k='heavy_count' and v<>trunc(v)) then raise exception 'invalid_dimension';end if;
 end loop;
 roof:=s->>'roof';wall:=s->>'wall';
 if roof is null or roof not in ('white','certified','composite') or wall is null or wall not in ('none','panel','composite') or coalesce(s->>'color','') not in ('white','bronze','black') or jsonb_typeof(s->'permit') is distinct from 'boolean' then raise exception 'invalid_options';end if;
 if not extended and wall<>'none' and ((s->>'wall_length')::numeric<=0 or (s->>'wall_height')::numeric<=0 or (s->>'wall_height')::numeric>(s->>'height')::numeric) then raise exception 'invalid_wall';end if;
 if oldrow.id is null or p_refresh then
  select * into book from public.price_books where company_id=p_company;
  if not found then raise exception 'prices_required';end if;r:=book.rates;pv:=book.version;
 else r:=oldrow.rate_snapshot;pv:=oldrow.price_version;end if;
 if extended then
  for wall_item in select value from jsonb_array_elements(s->'walls') loop
   if jsonb_typeof(wall_item) is distinct from 'object' then raise exception 'invalid_wall';end if;
   foreach k in array array['length','height'] loop
    if coalesce(wall_item->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' or (wall_item->>k)::numeric>200 then raise exception 'invalid_wall_dimension';end if;
   end loop;
   if coalesce(wall_item->>'model','') not in ('panel','composite','aluminum','solid31') or jsonb_typeof(wall_item->'color') is distinct from 'string' or length(wall_item->>'color')>80 then raise exception 'invalid_wall_options';end if;
   k:=wall_item->>'model';wall_color:=trim(wall_item->>'color');
   wall_label:=case k when 'panel' then 'Panel económico' when 'composite' then 'Composite imitación madera' when 'aluminum' then 'Aluminio' else 'Paneles sólido 3×1' end;
   -- ADT treats absent/zero wall tariffs as the model default. Capture the
   -- effective tariff only in this design's snapshot, never in another record.
   rate:=coalesce(nullif((r->>('wall_'||k))::numeric,0),case when k='panel' then 25 else 30 end);
   r:=r||jsonb_build_object('wall_'||k,rate::text);
   wall_total:=wall_total+(wall_item->>'length')::numeric*(wall_item->>'height')::numeric*rate;
   wall_area:=wall_area+(wall_item->>'length')::numeric*(wall_item->>'height')::numeric;
   wall_index:=wall_index+1;
   wall_details:=wall_details||case when wall_index>1 then ' · ' else '' end||wall_index||': '||wall_label||case when wall_color<>'' then ' '||wall_color else '' end||' · '||(wall_item->>'length')||'×'||(wall_item->>'height')||' ft';
   walls:=walls||jsonb_build_array(jsonb_build_object('length',wall_item->>'length','height',wall_item->>'height','model',k,'color',wall_color));
  end loop;
  wall_total:=round(wall_total,2);
  wall:='none';
 end if;
 permit_area:=case when roof_enabled then (s->>'length')::numeric*(s->>'width')::numeric else 0 end;
 -- Normalize the snapshot: supplied totals and unknown fields are discarded.
 s:=jsonb_build_object('length',s->>'length','width',s->>'width','height',s->>'height','roof',roof,'wall',wall,'color',s->>'color','wall_length',s->>'wall_length','wall_height',s->>'wall_height','kitchen_length',s->>'kitchen_length','heavy_count',s->>'heavy_count','permit',(s->>'permit')::boolean);
 if extended then s:=s||jsonb_build_object('walls',walls,'roof_enabled',roof_enabled,'wall','none','wall_length','0','wall_height','0');end if;
 for k in select unnest(array['roof','wall','kitchen','heavy','permit']) loop
  l:=0;w:=0;h:=0;qty:=1;basis:='fixed';rate:=0;label:='';
  if k='roof' and roof_enabled then basis:='area_ft2';l:=(s->>'length')::numeric;w:=(s->>'width')::numeric;rate:=(r->>('roof_'||roof))::numeric;label:='Pérgola '||roof;
  elsif k='wall' and extended and wall_total>0 then basis:='fixed';rate:=wall_total;label:='Pared privacidad ('||round(wall_area,2)::text||' ft²)';
  elsif k='wall' and not extended and wall<>'none' then basis:='area_ft2';l:=(s->>'wall_length')::numeric;w:=(s->>'wall_height')::numeric;rate:=(r->>('wall_'||wall))::numeric;label:='Pared '||wall;
  elsif k='kitchen' and (s->>'kitchen_length')::numeric>0 then basis:='linear_ft';l:=(s->>'kitchen_length')::numeric;rate:=(r->>'kitchen')::numeric;label:='Cocina exterior';
  elsif k='heavy' and (s->>'heavy_count')::numeric>0 then basis:='unit';qty:=(s->>'heavy_count')::numeric;rate:=(r->>'heavy_piece')::numeric;label:='Refuerzo por pieza';
  elsif k='permit' and (s->>'permit')::boolean then
   label:='Permiso';rate:=(r->>'permit_fixed')::numeric;
   -- ADT permisoDeArea keeps the fixed minimum above the area threshold.
   -- Use a fixed line while that minimum applies, so estimate normalization
   -- and the printed document reproduce the same amount without an override.
   if permit_area>(r->>'permit_threshold')::numeric
      and permit_area*(r->>'permit_area')::numeric>rate then
    basis:='area_ft2';l:=(s->>'length')::numeric;w:=(s->>'width')::numeric;rate:=(r->>'permit_area')::numeric;
   end if;
  end if;
  if label<>'' then
   v:=round(rate*qty*case when basis='area_ft2' then l*w when basis='linear_ft' then l else 1 end,2);total:=total+v;
   line:=jsonb_build_object('product_id',null,'name',label,'description','Tarifa versión '||pv||case when k='wall' and extended then ' · '||wall_details else '' end,'base',basis,'unit_price',rate::text,'qty',qty::text,'length',l::text,'width',w::text,'height',h::text,'manual_total','0','line_total',v::text);items:=items||jsonb_build_array(line);
  end if;
 end loop;
 if extended and total<=0 then raise exception 'empty_design';end if;
 if oldrow.id is null then
  insert into public.designs(id,company_id,kind,name,customer_id,spec,rate_snapshot,price_version,items,total,created_by,updated_by) values(p_id,p_company,p_kind,trim(p_data->>'name'),cid,s,r,pv,items,total,auth.uid(),auth.uid());
 else update public.designs set name=trim(p_data->>'name'),customer_id=cid,spec=s,rate_snapshot=r,price_version=pv,items=items,total=total,archived=coalesce((p_data->>'archived')::boolean,false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.save_price_book(p_company uuid, p_version integer, p_rates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k text;r jsonb:='{}';oldrow public.price_books;
begin
 if not app_private.can_access(p_company,'adm-precios','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_version is null or p_version<0 or p_rates is null or jsonb_typeof(p_rates)<>'object' or octet_length(p_rates::text)>10000 then raise exception 'invalid_rates';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':prices',0));
 select * into oldrow from public.price_books where company_id=p_company for update;
 if coalesce(oldrow.version,0)<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 foreach k in array array['roof_white','roof_certified','roof_composite','wall_panel','wall_composite','kitchen','permit_fixed','permit_threshold','permit_area','heavy_piece'] loop
  if coalesce(p_rates->>k,'') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'invalid_rate_%',k;end if;
  r:=r||jsonb_build_object(k,(p_rates->>k)::numeric::text);
 end loop;
 foreach k in array array['wall_aluminum','wall_solid31'] loop
  if p_rates ? k and coalesce(p_rates->>k,'') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'invalid_rate_%',k;end if;
  r:=r||jsonb_build_object(k,coalesce(p_rates->>k,oldrow.rates->>k,'30')::numeric::text);
 end loop;
 if (r->>'roof_white')::numeric<=0 or (r->>'roof_certified')::numeric<=0 or (r->>'roof_composite')::numeric<=0 then raise exception 'positive_roof_rate_required';end if;
 if p_version=0 then
  insert into public.price_books(id,company_id,rates,created_by,updated_by) values(gen_random_uuid(),p_company,r,auth.uid(),auth.uid());
 else update public.price_books set rates=r,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company;end if;
end;$function$;

commit;
