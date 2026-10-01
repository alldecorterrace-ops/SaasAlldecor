-- Capture commercial payment terms in the saved revision and approved invoice.
-- Additive: old documents and snapshots keep unknown terms; no payments/imports.
begin;
create function app_private.normalize_payment_terms(p_terms jsonb,p_total numeric)
returns jsonb language plpgsql immutable set search_path='' as $$
declare percentages jsonb:='[]';amounts jsonb:='[]';pc numeric;sum_pc numeric:=0;sum_amount numeric:=0;amount numeric;delivery date;i integer;
begin
 if p_terms is null or p_terms='null'::jsonb then return null;end if;
 if jsonb_typeof(p_terms)<>'object' or jsonb_typeof(p_terms->'percentages') is distinct from 'array'
 or jsonb_array_length(p_terms->'percentages')<>4 or jsonb_typeof(p_terms->'conditions') is distinct from 'string'
 or length(p_terms->>'conditions')>10000 or p_total is null or p_total<0 or p_total>999999999999.99 then raise exception 'invalid_payment_terms';end if;
 for i in 0..3 loop
  if jsonb_typeof(p_terms->'percentages'->i)<>'string' or (p_terms->'percentages'->>i)!~'^[0-9]{1,3}(\.[0-9]{1,2})?$' then raise exception 'invalid_payment_terms';end if;
  pc:=(p_terms->'percentages'->>i)::numeric;
  if pc>100 then raise exception 'invalid_payment_terms';end if;
  sum_pc:=sum_pc+pc;percentages:=percentages||jsonb_build_array(p_terms->'percentages'->>i);
  amount:=case when i=3 then p_total-sum_amount else round(p_total*pc/100,2) end;
  if amount<0 then raise exception 'invalid_payment_terms_rounding';end if;
  amounts:=amounts||jsonb_build_array(amount::numeric(14,2)::text);sum_amount:=sum_amount+amount;
 end loop;
 if sum_pc<>100 or sum_amount<>p_total then raise exception 'invalid_payment_terms';end if;
 if p_terms->'delivery_date' is distinct from 'null'::jsonb then
  if jsonb_typeof(p_terms->'delivery_date') is distinct from 'string' or (p_terms->>'delivery_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_payment_terms';end if;
  delivery:=(p_terms->>'delivery_date')::date;
 end if;
 return jsonb_build_object('percentages',percentages,'amounts',amounts,'delivery_date',delivery,'conditions',p_terms->>'conditions');
end;$$;
revoke all on function app_private.normalize_payment_terms(jsonb,numeric) from public,anon,authenticated;
alter table public.estimates add column commercial_terms jsonb;
alter table public.invoices add column commercial_terms jsonb;
alter table public.estimates add constraint estimate_commercial_terms check(commercial_terms is null or commercial_terms=app_private.normalize_payment_terms(commercial_terms,total));
alter table public.invoices add constraint invoice_commercial_terms check(commercial_terms is null or commercial_terms=app_private.normalize_payment_terms(commercial_terms,total));

CREATE OR REPLACE FUNCTION public.save_estimate(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.estimates;customer public.customers;item jsonb;normalized jsonb:='[]';
 price numeric;qty numeric;l numeric;w numeric;h numeric;amount numeric;sub numeric:=0;disc numeric;tax numeric;
 pid uuid;basis text;docnumber text;seq integer;yr integer;cid uuid;ed date;vd date;st text;notetext text;snapshot jsonb;key text;terms jsonb;
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
   if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'name',''))) not between 1 and 255 or length(coalesce(item->>'description',''))>2000 then raise exception 'invalid_item';end if;
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
 if disc>sub or sub-disc+tax>999999999999.99 then raise exception 'invalid_total';end if;
 terms:=app_private.normalize_payment_terms(case when p_data ? 'commercial_terms' then p_data->'commercial_terms' else oldrow.commercial_terms end,sub-disc+tax);
 if p_version=0 then
   yr:=extract(year from ed)::integer;
   insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'EST',yr,1)
   on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
   docnumber:='EST-'||yr::text||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0');
   insert into public.estimates(id,company_id,number,customer_id,customer_snapshot,estimate_date,valid_until,status,notes,items,subtotal,discount,taxes,total,commercial_terms,created_by,updated_by)
   values(p_id,p_company,docnumber,cid,snapshot,ed,vd,st,notetext,normalized,sub,disc,tax,sub-disc+tax,terms,auth.uid(),auth.uid());
 else
   update public.estimates set customer_id=cid,customer_snapshot=snapshot,estimate_date=ed,valid_until=vd,status=st,notes=notetext,items=normalized,subtotal=sub,discount=disc,taxes=tax,total=sub-disc+tax,commercial_terms=terms,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $function$;


CREATE OR REPLACE FUNCTION public.approve_estimate(p_company uuid, p_id uuid, p_version integer, p_date date, p_name text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.estimates;inv public.invoices;proj uuid:=gen_random_uuid();iid uuid:=gen_random_uuid();seq integer;yr integer;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') or not app_private.can_access(p_company,'fin-invoices','write') or not app_private.can_access(p_company,'fin-proyectos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.estimates where company_id=p_company and id=p_id for update;
 if not found then raise exception 'estimate_unavailable';end if;
 -- A retry of the same approved estimate returns the existing invoice, even after a void.
 select * into inv from public.invoices where company_id=p_company and estimate_id=p_id;
 if found then return inv.id;end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status not in ('BORRADOR','PENDIENTE') or e.total<=0 or p_date is null or p_name is null or length(trim(p_name)) not between 2 and 255 or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'invalid_approval';end if;
 insert into public.projects(id,company_id,estimate_id,customer_id,name,project_date,created_by,updated_by)
 values(proj,p_company,p_id,e.customer_id,trim(p_name),p_date,auth.uid(),auth.uid());
 yr:=extract(year from p_date)::integer;
 insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'INV',yr,1)
 on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
 insert into public.invoices(id,company_id,number,estimate_id,estimate_version,project_id,customer_id,customer_snapshot,items,subtotal,discount,taxes,total,invoice_date,balance_due,approval_note,commercial_terms,created_by,updated_by)
 values(iid,p_company,'INV-'||yr||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),p_id,e.version,proj,e.customer_id,e.customer_snapshot,e.items,e.subtotal,e.discount,e.taxes,e.total,p_date,e.total,trim(p_note),e.commercial_terms,auth.uid(),auth.uid());
 update public.estimates set status='APROBADO',version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 return iid;
end;$function$;


commit;
