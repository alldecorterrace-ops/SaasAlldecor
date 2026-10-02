-- Current invoice PDFs and durable, app-reported email handoffs.
-- No financial record, existing document, role, or business data is changed.
begin;
create or replace function public.prepare_commercial_document(p_company uuid,p_kind text,p_record uuid,p_version integer)
returns public.commercial_documents language plpgsql security definer set search_path='' as $$
declare src jsonb;co jsonb;d public.commercial_documents;ps jsonb;paid numeric;
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
 insert into public.commercial_documents(company_id,kind,record_id,customer_id,record_version,number,snapshot,created_by)
 values(p_company,p_kind,p_record,(src->>'customer_id')::uuid,p_version,src->>'number',jsonb_build_object('company',co,'record',src),auth.uid()) on conflict(company_id,kind,record_id,record_version) do nothing;
 select * into d from public.commercial_documents where company_id=p_company and kind=p_kind and record_id=p_record and record_version=p_version;
 return d;
end;$$;

create table public.invoice_email_attempts(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 request_id uuid not null,invoice_id uuid not null,document_id uuid not null,record_version integer not null check(record_version>0),
 requested_by uuid not null references auth.users(id),recipient text not null check(length(recipient) between 3 and 254 and recipient!~E'[\r\n]'),
 mode text not null check(mode in ('capture','send')),
 status text not null default 'processing' check(status in ('processing','captured','queued','failed','unknown')),
 created_at timestamptz not null default now(),finished_at timestamptz,mime_sha256 text,mime_bytes integer,
 unique(company_id,id),unique(company_id,request_id),
 foreign key(company_id,invoice_id) references public.invoices(company_id,id),
 foreign key(company_id,document_id) references public.commercial_documents(company_id,id),
 check((status='processing')=(finished_at is null)),
 check((mime_sha256 is null and mime_bytes is null) or (mime_sha256~'^[a-f0-9]{64}$' and mime_bytes between 1 and 8000000)),
 check(status<>'captured' or (mode='capture' and mime_sha256 is not null and mime_bytes is not null)),
 check(status<>'queued' or mode='send')
);
create index invoice_email_history on public.invoice_email_attempts(company_id,invoice_id,created_at desc,id);
alter table public.invoice_email_attempts enable row level security;
revoke all on public.invoice_email_attempts from public,anon,authenticated;
grant select on public.invoice_email_attempts to authenticated;
create policy invoice_email_read on public.invoice_email_attempts for select to authenticated using(app_private.can_access(company_id,'fin-invoices','read'));
create trigger invoice_email_audit after insert or update on public.invoice_email_attempts for each row execute function app_private.audit_change();

create function public.invoice_email_recipient(p_company uuid,p_invoice uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare recipient text;
begin
 if not app_private.can_access(p_company,'fin-invoices','read') then raise exception 'permission_denied' using errcode='42501';end if;
 select trim(c.email) into recipient from public.invoices i join public.customers c on c.company_id=i.company_id and c.id=i.customer_id where i.company_id=p_company and i.id=p_invoice;
 return recipient;
end;$$;
create function public.claim_invoice_email(p_company uuid,p_invoice uuid,p_version integer,p_document uuid,p_request uuid,p_mode text,p_expected_recipient text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invoices;d public.commercial_documents;a public.invoice_email_attempts;recipient text;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_invoice is null or p_document is null or p_version is null or p_version<1 or p_mode is null or p_mode not in ('capture','send') then raise exception 'invalid_mail_request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':invoice-mail',0));
 select * into a from public.invoice_email_attempts where company_id=p_company and request_id=p_request;
 if found then
  if a.invoice_id<>p_invoice or a.document_id<>p_document or a.record_version<>p_version or a.mode<>p_mode or a.requested_by<>auth.uid() or (p_expected_recipient is not null and a.recipient<>p_expected_recipient) then raise exception 'mail_request_conflict' using errcode='PT409';end if;
  return jsonb_build_object('claimed',false,'attempt',to_jsonb(a));
 end if;
 select * into i from public.invoices where company_id=p_company and id=p_invoice for share;
 if not found or i.historical_invoice_id is not null then raise exception 'invoice_unavailable';end if;
 if i.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 select * into d from public.commercial_documents where company_id=p_company and id=p_document and kind='invoice' and record_id=p_invoice and record_version=p_version and state='ready';
 if not found then raise exception 'document_unavailable';end if;
 -- The authenticated caller never supplies an address. ADT resolves the current
 -- invoice customer when sending; keep the PDF's captured revision unchanged.
 select trim(c.email) into recipient from public.customers c where c.company_id=p_company and c.id=i.customer_id;
 if recipient is null or length(recipient)>254 or recipient!~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$' or left(recipient,1)='-' then raise exception 'recipient_unavailable';end if;
 if p_expected_recipient is not null and recipient<>p_expected_recipient then raise exception 'recipient_changed' using errcode='PT409';end if;
 if p_mode='capture' and lower(recipient)!~'@saasalldecor[.]invalid$' then raise exception 'synthetic_recipient_required';end if;
 if (select count(*) from public.invoice_email_attempts where company_id=p_company and created_at>now()-interval '24 hours')>=100 then raise exception 'mail_rate_limited';end if;
 insert into public.invoice_email_attempts(company_id,request_id,invoice_id,document_id,record_version,requested_by,recipient,mode)
 values(p_company,p_request,p_invoice,p_document,p_version,auth.uid(),recipient,p_mode) returning * into a;
 return jsonb_build_object('claimed',true,'attempt',to_jsonb(a),'document',to_jsonb(d));
end;$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('invoice-email-captures','invoice-email-captures',false,8000000,array['message/rfc822']);
create function app_private.invoice_email_file_access(p_name text,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a public.invoice_email_attempts;
begin
 if p_name is null or p_name!~'^[0-9a-f-]{36}/[0-9a-f-]{36}\.eml$' or p_action is null or p_action not in ('read','write') then return false;end if;
 select * into a from public.invoice_email_attempts where company_id=split_part(p_name,'/',1)::uuid and id=split_part(split_part(p_name,'/',2),'.',1)::uuid and mode='capture';
 return found and app_private.can_access(a.company_id,'fin-invoices',p_action) and
  ((p_action='read' and (a.status='captured' or (a.status='processing' and a.requested_by=auth.uid()))) or
   (p_action='write' and a.status='processing' and a.requested_by=auth.uid()));
exception when invalid_text_representation then return false;
end;$$;
create policy invoice_email_capture_read on storage.objects for select to authenticated using(bucket_id='invoice-email-captures' and app_private.invoice_email_file_access(name,'read'));
create policy invoice_email_capture_insert on storage.objects for insert to authenticated with check(bucket_id='invoice-email-captures' and app_private.invoice_email_file_access(name,'write'));

create function public.finish_invoice_email(p_company uuid,p_attempt uuid,p_status text,p_sha256 text default null,p_bytes integer default null)
returns public.invoice_email_attempts language plpgsql security definer set search_path='' as $$
declare a public.invoice_email_attempts;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into a from public.invoice_email_attempts where company_id=p_company and id=p_attempt and requested_by=auth.uid() for update;
 if not found then raise exception 'mail_unavailable';end if;
 if p_status is null or p_status not in ('captured','queued','failed','unknown') or
  (p_status='captured' and a.mode<>'capture') or (p_status='queued' and a.mode<>'send') or
  ((p_sha256 is null)<>(p_bytes is null)) or (p_sha256 is not null and (p_sha256!~'^[a-f0-9]{64}$' or p_bytes not between 1 and 8000000)) or
  (p_status='captured' and p_sha256 is null) then raise exception 'invalid_mail_status';end if;
 if a.status<>'processing' then
  if a.status<>p_status or a.mime_sha256 is distinct from p_sha256 or a.mime_bytes is distinct from p_bytes then raise exception 'immutable_mail_outcome';end if;
  return a;
 end if;
 if p_status='captured' and not exists(select 1 from storage.objects where bucket_id='invoice-email-captures' and name=p_company::text||'/'||a.id::text||'.eml') then raise exception 'missing_mail_file';end if;
 update public.invoice_email_attempts set status=p_status,finished_at=now(),mime_sha256=p_sha256,mime_bytes=p_bytes where id=a.id returning * into a;
 return a;
end;$$;
revoke all on function public.invoice_email_recipient(uuid,uuid),public.claim_invoice_email(uuid,uuid,integer,uuid,uuid,text,text),public.finish_invoice_email(uuid,uuid,text,text,integer),app_private.invoice_email_file_access(text,text) from public,anon;
grant execute on function public.invoice_email_recipient(uuid,uuid),public.claim_invoice_email(uuid,uuid,integer,uuid,uuid,text,text),public.finish_invoice_email(uuid,uuid,text,text,integer),app_private.invoice_email_file_access(text,text) to authenticated;
comment on table public.invoice_email_attempts is 'App-reported local handoffs. Queued means MTA accepted, not recipient delivery. Capture is synthetic and never sends. Processing/unknown never auto-retry.';
commit;
