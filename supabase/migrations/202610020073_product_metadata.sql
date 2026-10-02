-- Additive catalog metadata. No ADT import, price calculation change or revision rewrite.
begin;
alter table public.products add column details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(details)='object');

create function app_private.product_raster_allowed(b bytea) returns boolean
language plpgsql immutable set search_path='' as $$
declare at integer:=2;marker integer;n integer;size integer:=octet_length(b);
begin
 if size>=24 and substring(b from 1 for 8)=decode('89504e470d0a1a0a','hex') and substring(b from 13 for 4)=convert_to('IHDR','UTF8') then return true;end if;
 if size>=4 and get_byte(b,0)=255 and get_byte(b,1)=216 then
  while at+3<size loop
   if get_byte(b,at)<>255 then return false;end if;at:=at+1;
   while at<size and get_byte(b,at)=255 loop at:=at+1;end loop;
   marker:=get_byte(b,at);at:=at+1;
   if marker in (217,218) then return false;end if;
   if marker=1 or marker between 208 and 215 then continue;end if;
   n:=get_byte(b,at)*256+get_byte(b,at+1);
   if n<2 or at+n>size then return false;end if;
   if marker in (192,193,194,195,197,198,199,201,202,203,205,206,207) then return n>=7;end if;
   at:=at+n;
  end loop;
 end if;
 if substring(b from 1 for 4)=convert_to('RIFF','UTF8') and substring(b from 9 for 4)=convert_to('WEBP','UTF8') then
  if size>=30 and substring(b from 13 for 4)=convert_to('VP8X','UTF8') then return true;end if;
  if size>=25 and substring(b from 13 for 4)=convert_to('VP8L','UTF8') and get_byte(b,20)=47 then return true;end if;
  if size>=30 and substring(b from 13 for 4)=convert_to('VP8 ','UTF8') and get_byte(b,23)=157 and get_byte(b,24)=1 and get_byte(b,25)=42 then return true;end if;
 end if;
 return false;
exception when others then return false;
end;$$;
create function app_private.product_image_allowed(image text) returns boolean
language plpgsql immutable set search_path='' as $$
declare payload text;authority text;port text;host text;
begin
 if image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
  payload:=split_part(image,',',2);
  if payload !~ '^[A-Za-z0-9+/]+={0,2}$' or length(payload)%4=1 or (position('=' in payload)>0 and length(payload)%4<>0) then return false;end if;
  payload:=rtrim(payload,'=');
  return app_private.product_raster_allowed(decode(payload||repeat('=',(4-length(payload)%4)%4),'base64'));
 end if;
 if image ~ '^/(adt/|sites/default/files/)[^[:space:]<>"[:cntrl:]]+$' then return true;end if;
 if image !~ '^https://[^[:space:]<>"[:cntrl:]]+$' then return false;end if;
 authority:=split_part(split_part(split_part(substring(image from 9),'/',1),'?',1),'#',1);
 if authority='' or position('@' in authority)>0 then return false;end if;
 if authority ~ '^\[[0-9A-Fa-f:]+\](:[0-9]+)?$' then
  host:=split_part(authority,']',1)||']';port:=nullif(substring(authority from length(host)+2),'');
 else
  host:=split_part(authority,':',1);port:=nullif(split_part(authority,':',2),'');
  if host !~ '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' or host ~ '(^|\.)-|-(\.|$)|\.\.' or authority !~ '^[A-Za-z0-9.-]+(:[0-9]+)?$' then return false;end if;
 end if;
 if port is not null and (length(port)>5 or port::integer>65535) then return false;end if;
 return true;
exception when others then return false;
end;$$;
create function app_private.normalize_product_metadata(input jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}';dims jsonb:='{}';rawdims jsonb;images jsonb:='[]';rawimages jsonb;
 k text;v jsonb;txt text;limit_chars integer;n double precision;image jsonb;bytes integer:=0;
begin
 if input is null or jsonb_typeof(input)<>'object' then raise exception 'invalid_product_metadata';end if;
 foreach k in array array['sku','brand','model','description','material','finish','warranty','leadTime','includes','care'] loop
  v:=input->k;
  if v is null or v='null'::jsonb or v='false'::jsonb then txt:='';
  elsif v='true'::jsonb then txt:='1';
  elsif jsonb_typeof(v) in ('string','number') then txt:=input->>k;
  else raise exception 'invalid_product_metadata';end if;
  txt:=btrim(txt,E' \t\n\r\013');
  limit_chars:=case k when 'sku' then 100 when 'brand' then 120 when 'model' then 120 when 'description' then 6000 when 'material' then 180 when 'finish' then 180 when 'warranty' then 1500 when 'leadTime' then 180 when 'includes' then 2000 else 1500 end;
  if length(txt)>limit_chars then raise exception 'invalid_product_metadata';end if;
  result:=result||jsonb_build_object(k,txt);
 end loop;
 rawdims:=coalesce(nullif(input->'dimensions','null'::jsonb),'{}');
 if jsonb_typeof(rawdims) not in ('object','array') then raise exception 'invalid_product_dimensions';end if;
 foreach k in array array['length','width','height','thickness','weight'] loop
  v:=rawdims->k;
  if v is null or v='null'::jsonb or v='""'::jsonb then dims:=dims||jsonb_build_object(k,'');
  else
   if jsonb_typeof(v) not in ('string','number') or coalesce(rawdims->>k,'') !~ '^[[:space:]]*[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?[[:space:]]*$' then raise exception 'invalid_product_dimensions';end if;
   n:=(rawdims->>k)::double precision;
   if n<=0 or n>1000000 or n::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_product_dimensions';end if;
   dims:=dims||jsonb_build_object(k,n);
  end if;
 end loop;
 txt:=coalesce(rawdims->>'unit','in');if txt not in ('in','ft','mm','cm','m') then raise exception 'invalid_product_unit';end if;dims:=dims||jsonb_build_object('unit',txt);
 txt:=coalesce(rawdims->>'weightUnit','lb');if txt not in ('lb','kg') then raise exception 'invalid_product_unit';end if;dims:=dims||jsonb_build_object('weightUnit',txt);
 rawimages:=coalesce(nullif(input->'images','null'::jsonb),'[]');
 if jsonb_typeof(rawimages)<>'array' or jsonb_array_length(rawimages)>6 then raise exception 'invalid_product_images';end if;
 for image in select value from jsonb_array_elements(rawimages) loop
  txt:=image#>>'{}';
  if jsonb_typeof(image)<>'string' or octet_length(txt)>1600000 or not app_private.product_image_allowed(txt) then raise exception 'invalid_product_images';end if;
  bytes:=bytes+octet_length(txt);
  if not images @> jsonb_build_array(image) then images:=images||jsonb_build_array(image);end if;
 end loop;
 if bytes>4000000 then raise exception 'product_gallery_too_large';end if;
 return result||jsonb_build_object('dimensions',dims,'images',images,'version',1);
end;$$;
revoke all on function app_private.product_raster_allowed(bytea),app_private.product_image_allowed(text),app_private.normalize_product_metadata(jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_product(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.products;r public.products;metadata jsonb;s jsonb;g jsonb;c jsonb;
begin
 if not app_private.can_access(p_company,'productos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4500000 then raise exception 'invalid_product';end if;
 if p_version>0 then
  select * into oldrow from public.products where company_id=p_company and id=p_id for update;
  if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 end if;
 if coalesce(p_data->>'unit_price','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_price';end if;
 if not app_private.valid_product_details(p_data->'specs',p_data->'options') then raise exception 'invalid_product_options';end if;
 for s in select value from jsonb_array_elements(p_data->'specs') loop
  if s ? 'value' and (jsonb_typeof(s->'value')<>'string' or length(s->>'value')>6000) then raise exception 'invalid_product_specification';end if;
 end loop;
 for g in select value from jsonb_array_elements(p_data->'options') loop
  if g ? 'kind' and (jsonb_typeof(g->'kind')<>'string' or g->>'kind' not in ('color','size','finish','other')) then raise exception 'invalid_product_option_kind';end if;
  for c in select value from jsonb_array_elements(g->'choices') loop
   if c ? 'colorHex' and (jsonb_typeof(c->'colorHex')<>'string' or c->>'colorHex' !~ '^(#[0-9a-fA-F]{6})?$') then raise exception 'invalid_product_color';end if;
  end loop;
 end loop;
 -- Old clients omit details; their edits must preserve the newer gallery and metadata.
 metadata:=case when p_data ? 'details' then app_private.normalize_product_metadata(p_data->'details') else coalesce(oldrow.details,'{}'::jsonb) end;
 select * into r from jsonb_populate_record(null::public.products,p_data);
 if p_version=0 then
  insert into public.products(id,company_id,name,category,base,unit_price,specs,options,active,details,created_by,updated_by)
  values(p_id,p_company,trim(r.name),trim(r.category),r.base,r.unit_price,r.specs,r.options,r.active,metadata,auth.uid(),auth.uid());
 else
  update public.products set name=trim(r.name),category=trim(r.category),base=r.base,unit_price=r.unit_price,specs=r.specs,options=r.options,active=r.active,details=metadata,
    version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end;$$;

-- save_estimate retains its existing rules; only the description capacity grows.
-- The new implementation is appended below without rewriting existing revisions.

CREATE OR REPLACE FUNCTION public.save_estimate(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.estimates;customer public.customers;item jsonb;normalized jsonb:='[]';
 price numeric;qty numeric;l numeric;w numeric;h numeric;amount numeric;sub numeric:=0;disc numeric;tax numeric;
 pid uuid;basis text;docnumber text;seq integer;yr integer;cid uuid;ed date;vd date;st text;notetext text;snapshot jsonb;key text;terms jsonb;tax_percent smallint;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>200000 then raise exception 'invalid_estimate'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then
   select * into oldrow from public.estimates where company_id=p_company and id=p_id for update;
   if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409'; end if;
   if oldrow.status='ANULADA' then raise exception 'estimate_voided'; end if;
 end if;
 cid:=(p_data->>'customer_id')::uuid;ed:=(p_data->>'estimate_date')::date;vd:=nullif(p_data->>'valid_until','')::date;st:=p_data->>'status';notetext:=p_data->>'notes';
 if cid is null or ed is null or st is null or st not in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA') or notetext is null or length(notetext)>10000 or (vd is not null and vd<ed) then raise exception 'invalid_estimate'; end if;
 if p_version=0 or oldrow.customer_id<>cid then
   if not app_private.can_access(p_company,'clientes','read') then raise exception 'customer_access_required' using errcode='42501'; end if;
   select * into customer from public.customers where company_id=p_company and id=cid and status='active';
   if not found then raise exception 'customer_unavailable'; end if;
   snapshot:=jsonb_build_object('full_name',customer.full_name,'email',customer.email,'phone',customer.phone,'address',customer.address,'city',customer.city,'postal_code',customer.postal_code);
 else snapshot:=oldrow.customer_snapshot;end if;
 if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'invalid_items';end if;
 if jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'invalid_items';end if;
 for item in select value from jsonb_array_elements(p_data->'items') loop
   if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'name',''))) not between 1 and 255 or length(coalesce(item->>'description',''))>10000 then raise exception 'invalid_item';end if;
   basis:=item->>'base';if basis is null or basis not in ('area_ft2','linear_ft','volume_ft3','unit','fixed','manual') then raise exception 'invalid_basis';end if;
   foreach key in array array['unit_price','manual_total'] loop
     if coalesce(item->>key,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_money';end if;
   end loop;
   foreach key in array array['qty','length','width','height'] loop
     if coalesce(item->>key,'') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception 'invalid_dimension';end if;
   end loop;
   price:=(item->>'unit_price')::numeric;qty:=(item->>'qty')::numeric;l:=(item->>'length')::numeric;w:=(item->>'width')::numeric;h:=(item->>'height')::numeric;
   if qty<=0 or (basis in ('area_ft2','linear_ft','volume_ft3') and l<=0) or (basis in ('area_ft2','volume_ft3') and w<=0) or (basis='volume_ft3' and h<=0) then raise exception 'invalid_dimension';end if;
   pid:=nullif(item->>'product_id','')::uuid;
   if pid is not null then
     if not exists(select 1 from public.products where company_id=p_company and id=pid) then raise exception 'product_unavailable';end if;
     -- An existing line retains its historic reference after catalog access is revoked.
     if not exists(select 1 from jsonb_array_elements(coalesce(oldrow.items,'[]')) x where x->>'product_id'=pid::text)
       and (not app_private.can_access(p_company,'productos','read') or not exists(select 1 from public.products where company_id=p_company and id=pid and active)) then raise exception 'product_access_required' using errcode='42501';end if;
   end if;
   amount:=round(case basis when 'area_ft2' then price*qty*l*w when 'linear_ft' then price*qty*l when 'volume_ft3' then price*qty*l*w*h when 'manual' then (item->>'manual_total')::numeric else price*qty end,2);
   sub:=sub+amount;if sub>999999999999.99 then raise exception 'amount_too_large';end if;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('product_id',pid,'name',trim(item->>'name'),'description',coalesce(item->>'description',''),'base',basis,'unit_price',price::text,'qty',qty::text,'length',l::text,'width',w::text,'height',h::text,'manual_total',(item->>'manual_total')::numeric::text,'line_total',amount::text));
 end loop;
 foreach key in array array['discount','taxes'] loop
   if coalesce(p_data->>key,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_money';end if;
 end loop;
 disc:=(p_data->>'discount')::numeric;tax:=(p_data->>'taxes')::numeric;
 if disc>sub then raise exception 'invalid_total';end if;
 if p_data ? 'tax_pct' then
   if p_data->'tax_pct'='null'::jsonb then tax_percent:=null;
   else
     if jsonb_typeof(p_data->'tax_pct') not in ('string','number') or coalesce(p_data->>'tax_pct','') !~ '^(0|7)$' then raise exception 'invalid_tax_percent';end if;
     tax_percent:=(p_data->>'tax_pct')::smallint;
   end if;
 else tax_percent:=oldrow.tax_pct;end if;
 -- Only an explicitly captured rate determines the tax. Legacy amounts remain amounts.
 if tax_percent is not null then tax:=round((sub-disc)*tax_percent/100,2);end if;
 if sub-disc+tax>999999999999.99 then raise exception 'invalid_total';end if;
 terms:=app_private.normalize_payment_terms(case when p_data ? 'commercial_terms' then p_data->'commercial_terms' else oldrow.commercial_terms end,sub-disc+tax);
 if p_version=0 then
   yr:=extract(year from ed)::integer;
   insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'EST',yr,1)
   on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
   docnumber:='EST-'||yr::text||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0');
   insert into public.estimates(id,company_id,number,customer_id,customer_snapshot,estimate_date,valid_until,status,notes,items,subtotal,discount,taxes,total,commercial_terms,tax_pct,created_by,updated_by)
   values(p_id,p_company,docnumber,cid,snapshot,ed,vd,st,notetext,normalized,sub,disc,tax,sub-disc+tax,terms,tax_percent,auth.uid(),auth.uid());
 else
   update public.estimates set customer_id=cid,customer_snapshot=snapshot,estimate_date=ed,valid_until=vd,status=st,notes=notetext,items=normalized,subtotal=sub,discount=disc,taxes=tax,total=sub-disc+tax,commercial_terms=terms,tax_pct=tax_percent,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $function$;

commit;
