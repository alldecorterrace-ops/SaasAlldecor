-- Optional tenant identity for newly captured PDFs. No business backfill.
begin;
create function app_private.normalize_commercial_identity(p_data jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text;v text;cap integer;result jsonb:='{}'::jsonb;
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or (select count(*) from jsonb_object_keys(p_data))<>9 then raise exception 'invalid_commercial_identity';end if;
 foreach k in array array['legal_name','tagline','address','phone','email','website','license','payment_instructions','footer'] loop
  if jsonb_typeof(p_data->k) is distinct from 'string' then raise exception 'invalid_commercial_identity';end if;
  v:=btrim(replace(replace(p_data->>k,E'\r\n',E'\n'),E'\r',E'\n'),E' \t\n\r');
  cap:=case k when 'legal_name' then 160 when 'tagline' then 255 when 'address' then 1000 when 'phone' then 64 when 'email' then 254 when 'website' then 500 when 'license' then 500 else 2000 end;
  if length(v)>cap or (case when k in ('address','payment_instructions','footer') then replace(v,E'\n','') else v end)~'[[:cntrl:]]' then raise exception 'invalid_commercial_identity';end if;
  if k='email' and v<>'' and (v!~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$' or left(v,1)='-') then raise exception 'invalid_commercial_identity';end if;
  if k='website' and v<>'' and v!~'^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$' then raise exception 'invalid_commercial_identity';end if;
  result:=result||jsonb_build_object(k,v);
 end loop;
 return result;
end;$$;
revoke all on function app_private.normalize_commercial_identity(jsonb) from public,anon,authenticated;
create table public.commercial_profiles (
 id uuid primary key default gen_random_uuid(),company_id uuid not null unique references public.companies(id),
 identity jsonb not null check(app_private.normalize_commercial_identity(identity)=identity),
 version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.commercial_profiles enable row level security;
revoke all on public.commercial_profiles from public,anon,authenticated;
grant select on public.commercial_profiles to authenticated;
create policy commercial_profiles_read on public.commercial_profiles for select to authenticated using(
 app_private.can_access(company_id,'fin-estimados','read') or app_private.can_access(company_id,'fin-invoices','read'));
create trigger commercial_profiles_audit after insert or update on public.commercial_profiles for each row execute function app_private.audit_change();
create function public.save_commercial_identity(p_company uuid,p_version integer,p_data jsonb,p_confirmed boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare oldrow public.commercial_profiles;normalized jsonb;v integer;
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 if p_confirmed is distinct from true then raise exception 'identity_confirmation_required';end if;
 if p_version is null or p_version<0 then raise exception 'invalid_commercial_identity';end if;
 normalized:=app_private.normalize_commercial_identity(p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':commercial-profile',0));
 select * into oldrow from public.commercial_profiles where company_id=p_company for update;
 if coalesce(oldrow.version,0)<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if oldrow.id is null then
  insert into public.commercial_profiles(company_id,identity,created_by,updated_by) values(p_company,normalized,auth.uid(),auth.uid()) returning version into v;
 else
  update public.commercial_profiles set identity=normalized,version=version+1,updated_at=now(),updated_by=auth.uid() where id=oldrow.id returning version into v;
 end if;
 return v;
end;$$;
revoke all on function public.save_commercial_identity(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.save_commercial_identity(uuid,integer,jsonb,boolean) to authenticated;
create or replace function public.prepare_commercial_document(p_company uuid,p_kind text,p_record uuid,p_version integer)
returns public.commercial_documents language plpgsql security definer set search_path='' as $$
declare src jsonb;co jsonb;d public.commercial_documents;ps jsonb;paid numeric;identityrow public.commercial_profiles;
begin
 if p_kind is null or p_kind not in ('estimate','invoice') or not app_private.can_access(p_company,app_private.commercial_module(p_kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_kind='estimate' then select to_jsonb(e) into src from public.estimates e where company_id=p_company and id=p_record for share;
 else select to_jsonb(i) into src from public.invoices i where company_id=p_company and id=p_record for share;end if;
 if src is null then raise exception 'document_unavailable';end if;
 if p_version is null or (src->>'version')::integer<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_kind='estimate' and src->>'status' in ('BORRADOR','ANULADA') then raise exception 'document_state';end if;
 if coalesce(src->>'historical_estimate_id',src->>'historical_invoice_id') is not null then raise exception 'historical_original_required';end if;
 if p_kind='invoice' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'payment_date',p.payment_date,'amount',p.amount,'method',p.method,'reference',p.reference,'notes',p.notes) order by p.payment_date,p.created_at,p.id),'[]'::jsonb),coalesce(sum(p.amount),0) into ps,paid
  from public.payments p where p.company_id=p_company and p.invoice_id=p_record and p.status='APPLIED';
  -- ADT's VOID invoice retains cached paid/balance while associated payments
  -- disappear from the applied-payment table. Validate open invoices only.
  if src->>'status'<>'VOID' and (paid is distinct from (src->>'paid_amount')::numeric or ((src->>'total')::numeric-paid) is distinct from (src->>'balance_due')::numeric) then raise exception 'payment_snapshot_mismatch';end if;
  src:=src||jsonb_build_object('payments',ps);
 end if;
 select jsonb_build_object('name',name,'timezone',timezone) into co from public.companies where id=p_company;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':commercial-profile',0));
 select * into identityrow from public.commercial_profiles where company_id=p_company for share;
 if found then co:=co||jsonb_build_object('commercial',identityrow.identity||jsonb_build_object('version',identityrow.version));end if;
 insert into public.commercial_documents(company_id,kind,record_id,customer_id,record_version,number,snapshot,created_by)
 values(p_company,p_kind,p_record,(src->>'customer_id')::uuid,p_version,src->>'number',jsonb_build_object('company',co,'record',src),auth.uid()) on conflict(company_id,kind,record_id,record_version) do nothing;
 select * into d from public.commercial_documents where company_id=p_company and kind=p_kind and record_id=p_record and record_version=p_version;
 return d;
end;$$;

notify pgrst,'reload schema';
commit;
