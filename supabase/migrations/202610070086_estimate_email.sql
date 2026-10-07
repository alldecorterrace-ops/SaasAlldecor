-- Estimate email parity: saved revision, customer recipient, pending/sent/error.
-- Additive mail history and private captures; no imports or external activation.
begin;
alter table public.estimates drop constraint estimates_status_check;
alter table public.estimates add constraint estimates_status_check check(status in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA','APROBADO','ENVIADO','PENDIENTE_ENVIO','ERROR_ENVIO'));
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
   if oldrow.status='PENDIENTE_ENVIO' then raise exception 'estimate_mail_pending';end if;
   if oldrow.status='ANULADA' then raise exception 'estimate_voided'; end if;
 end if;
 cid:=(p_data->>'customer_id')::uuid;ed:=(p_data->>'estimate_date')::date;vd:=nullif(p_data->>'valid_until','')::date;st:=p_data->>'status';notetext:=p_data->>'notes';
 if cid is null or ed is null or st is null or st not in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA','ENVIADO','ERROR_ENVIO') or notetext is null or length(notetext)>10000 or (vd is not null and vd<ed) then raise exception 'invalid_estimate'; end if;
 if st in ('ENVIADO','ERROR_ENVIO') and (p_version=0 or oldrow.status is distinct from st) then raise exception 'invalid_estimate_mail_state';end if;
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
 if e.historical_estimate_id is not null then raise exception 'invalid_approval';end if;
 -- A retry of the same approved estimate returns the existing invoice, even after a void.
 select * into inv from public.invoices where company_id=p_company and estimate_id=p_id;
 if found then return inv.id;end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status not in ('BORRADOR','PENDIENTE','ENVIADO') or e.total<=0 or p_date is null or p_name is null or length(trim(p_name)) not between 2 and 255 or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'invalid_approval';end if;
 insert into public.projects(id,company_id,estimate_id,customer_id,name,project_date,created_by,updated_by)
 values(proj,p_company,p_id,e.customer_id,trim(p_name),p_date,auth.uid(),auth.uid());
 yr:=extract(year from p_date)::integer;
 insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'INV',yr,1)
 on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
 insert into public.invoices(id,company_id,number,estimate_id,estimate_version,project_id,customer_id,customer_snapshot,items,subtotal,discount,taxes,total,invoice_date,balance_due,approval_note,commercial_terms,tax_pct,created_by,updated_by)
 values(iid,p_company,'INV-'||yr||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),p_id,e.version,proj,e.customer_id,e.customer_snapshot,e.items,e.subtotal,e.discount,e.taxes,e.total,p_date,e.total,trim(p_note),e.commercial_terms,e.tax_pct,auth.uid(),auth.uid());
 update public.estimates set status='APROBADO',version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 return iid;
end;$function$;



create table public.estimate_email_attempts(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 request_id uuid not null,estimate_id uuid not null,document_id uuid not null,record_version integer not null check(record_version>0),
 requested_by uuid not null references auth.users(id),recipient text not null check(length(recipient) between 3 and 254 and recipient!~E'[\r\n]'),
 mode text not null check(mode in ('capture','send')),
 status text not null default 'processing' check(status in ('processing','captured','queued','failed','unknown')),
 created_at timestamptz not null default now(),finished_at timestamptz,mime_sha256 text,mime_bytes integer,
 unique(company_id,id),unique(company_id,request_id),
 foreign key(company_id,estimate_id) references public.estimates(company_id,id),
 foreign key(company_id,document_id) references public.commercial_documents(company_id,id),
 check((status='processing')=(finished_at is null)),
 check((mime_sha256 is null and mime_bytes is null) or (mime_sha256~'^[a-f0-9]{64}$' and mime_bytes between 1 and 8000000)),
 check(status<>'captured' or (mode='capture' and mime_sha256 is not null and mime_bytes is not null)),
 check(status<>'queued' or mode='send')
);
create index estimate_email_history on public.estimate_email_attempts(company_id,estimate_id,created_at desc,id);
alter table public.estimate_email_attempts enable row level security;
revoke all on public.estimate_email_attempts from public,anon,authenticated;
grant select on public.estimate_email_attempts to authenticated;
create policy estimate_email_read on public.estimate_email_attempts for select to authenticated using(app_private.can_access(company_id,'fin-estimados','read'));
create trigger estimate_email_audit after insert or update on public.estimate_email_attempts for each row execute function app_private.audit_change();

create function public.estimate_email_recipient(p_company uuid,p_estimate uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare recipient text;
begin
 if not app_private.can_access(p_company,'fin-estimados','read') then raise exception 'permission_denied' using errcode='42501';end if;
 select trim(c.email) into recipient from public.estimates i join public.customers c on c.company_id=i.company_id and c.id=i.customer_id where i.company_id=p_company and i.id=p_estimate;
 return recipient;
end;$$;
create function public.claim_estimate_email(p_company uuid,p_estimate uuid,p_version integer,p_document uuid,p_request uuid,p_mode text,p_expected_recipient text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.estimates;d public.commercial_documents;a public.estimate_email_attempts;recipient text;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_estimate is null or p_document is null or p_version is null or p_version<1 or p_mode is null or p_mode not in ('capture','send') then raise exception 'invalid_mail_request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':estimate-mail',0));
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into a from public.estimate_email_attempts where company_id=p_company and request_id=p_request;
 if found then
  if a.estimate_id<>p_estimate or a.document_id<>p_document or a.record_version<>p_version or a.mode<>p_mode or a.requested_by<>auth.uid() or (p_expected_recipient is not null and a.recipient<>p_expected_recipient) then raise exception 'mail_request_conflict' using errcode='PT409';end if;
  return jsonb_build_object('claimed',false,'attempt',to_jsonb(a));
 end if;
 select * into i from public.estimates where company_id=p_company and id=p_estimate for update;
 if not found or i.historical_estimate_id is not null then raise exception 'estimate_unavailable';end if;
 if i.status not in ('PENDIENTE','ENVIADO','ERROR_ENVIO') then raise exception 'estimate_mail_state';end if;
 if i.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 select * into d from public.commercial_documents where company_id=p_company and id=p_document and kind='estimate' and record_id=p_estimate and record_version=p_version and state='ready';
 if not found then raise exception 'document_unavailable';end if;
 -- The authenticated caller never supplies an address. ADT resolves the current
 -- estimate customer when sending; keep the PDF's captured revision unchanged.
 select trim(c.email) into recipient from public.customers c where c.company_id=p_company and c.id=i.customer_id for share;
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if recipient is null or length(recipient)>254 or recipient!~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$' or left(recipient,1)='-' then raise exception 'recipient_unavailable';end if;
 if p_expected_recipient is not null and recipient<>p_expected_recipient then raise exception 'recipient_changed' using errcode='PT409';end if;
 if p_mode='capture' and lower(recipient)!~'@saasalldecor[.]invalid$' then raise exception 'synthetic_recipient_required';end if;
 if (select count(*) from public.estimate_email_attempts where company_id=p_company and created_at>now()-interval '24 hours')>=100 then raise exception 'mail_rate_limited';end if;
 insert into public.estimate_email_attempts(company_id,request_id,estimate_id,document_id,record_version,requested_by,recipient,mode)
 values(p_company,p_request,p_estimate,p_document,p_version,auth.uid(),recipient,p_mode) returning * into a;
 if p_mode='send' then
  update public.estimates set status='PENDIENTE_ENVIO',version=version+1,updated_at=now(),updated_by=auth.uid() where company_id=p_company and id=p_estimate;
 end if;
 return jsonb_build_object('claimed',true,'attempt',to_jsonb(a),'document',to_jsonb(d));
end;$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('estimate-email-captures','estimate-email-captures',false,8000000,array['message/rfc822']);
create function app_private.estimate_email_file_access(p_name text,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a public.estimate_email_attempts;
begin
 if p_name is null or p_name!~'^[0-9a-f-]{36}/[0-9a-f-]{36}\.eml$' or p_action is null or p_action not in ('read','write') then return false;end if;
 select * into a from public.estimate_email_attempts where company_id=split_part(p_name,'/',1)::uuid and id=split_part(split_part(p_name,'/',2),'.',1)::uuid and mode='capture';
 return found and app_private.can_access(a.company_id,'fin-estimados',p_action) and
  ((p_action='read' and (a.status='captured' or (a.status='processing' and a.requested_by=auth.uid()))) or
   (p_action='write' and a.status='processing' and a.requested_by=auth.uid()));
exception when invalid_text_representation then return false;
end;$$;
create policy estimate_email_capture_read on storage.objects for select to authenticated using(bucket_id='estimate-email-captures' and app_private.estimate_email_file_access(name,'read'));
create policy estimate_email_capture_insert on storage.objects for insert to authenticated with check(bucket_id='estimate-email-captures' and app_private.estimate_email_file_access(name,'write'));

create function public.finish_estimate_email(p_company uuid,p_attempt uuid,p_status text,p_sha256 text default null,p_bytes integer default null)
returns public.estimate_email_attempts language plpgsql security definer set search_path='' as $$
declare a public.estimate_email_attempts;e public.estimates;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into a from public.estimate_email_attempts where company_id=p_company and id=p_attempt and requested_by=auth.uid() for update;
 if not found then raise exception 'mail_unavailable';end if;
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_status is null or p_status not in ('captured','queued','failed','unknown') or
  (p_status='captured' and a.mode<>'capture') or (p_status='queued' and a.mode<>'send') or
  ((p_sha256 is null)<>(p_bytes is null)) or (p_sha256 is not null and (p_sha256!~'^[a-f0-9]{64}$' or p_bytes not between 1 and 8000000)) or
  (p_status='captured' and p_sha256 is null) then raise exception 'invalid_mail_status';end if;
 if a.status<>'processing' then
  if a.status<>p_status or a.mime_sha256 is distinct from p_sha256 or a.mime_bytes is distinct from p_bytes then raise exception 'immutable_mail_outcome';end if;
  return a;
 end if;
 if p_status='captured' and not exists(select 1 from storage.objects where bucket_id='estimate-email-captures' and name=p_company::text||'/'||a.id::text||'.eml') then raise exception 'missing_mail_file';end if;
 if a.mode='send' then
  select * into e from public.estimates where company_id=p_company and id=a.estimate_id for update;
  if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
  if e.version<>a.record_version+1 or e.status<>'PENDIENTE_ENVIO' then raise exception 'record_conflict' using errcode='PT409';end if;
  if p_status in ('queued','failed') then
   update public.estimates set status=case when p_status='queued' then 'ENVIADO' else 'ERROR_ENVIO' end,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=a.estimate_id;
  end if;
 end if;
 update public.estimate_email_attempts set status=p_status,finished_at=now(),mime_sha256=p_sha256,mime_bytes=p_bytes where id=a.id returning * into a;
 return a;
end;$$;
revoke all on function public.estimate_email_recipient(uuid,uuid),public.claim_estimate_email(uuid,uuid,integer,uuid,uuid,text,text),public.finish_estimate_email(uuid,uuid,text,text,integer),app_private.estimate_email_file_access(text,text) from public,anon;
grant execute on function public.estimate_email_recipient(uuid,uuid),public.claim_estimate_email(uuid,uuid,integer,uuid,uuid,text,text),public.finish_estimate_email(uuid,uuid,text,text,integer),app_private.estimate_email_file_access(text,text) to authenticated;
comment on table public.estimate_email_attempts is 'App-reported local handoffs. Queued means MTA accepted, not recipient delivery. Capture is synthetic and never sends. Processing/unknown never auto-retry.';
commit;
