-- Capture applied payments in new immutable invoice documents only.
-- Existing snapshots/files, financial rows and permissions remain unchanged.
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
 if (p_kind='estimate' and src->>'status' in ('BORRADOR','ANULADA')) or (p_kind='invoice' and src->>'status'='VOID') then raise exception 'document_state';end if;
 if coalesce(src->>'historical_estimate_id',src->>'historical_invoice_id') is not null then raise exception 'historical_original_required';end if;
 -- Invoice's shared lock serializes capture against payment/reversal writers.
 -- Only applied payments contribute to this immutable invoice document, as in ADT.
 if p_kind='invoice' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,
   'payment_date',p.payment_date,'amount',p.amount,'method',p.method,
   'reference',p.reference,'notes',p.notes) order by p.payment_date,p.created_at,p.id),'[]'::jsonb),
   coalesce(sum(p.amount),0) into ps,paid
  from public.payments p where p.company_id=p_company and p.invoice_id=p_record and p.status='APPLIED';
  if paid is distinct from (src->>'paid_amount')::numeric or
   ((src->>'total')::numeric-paid) is distinct from (src->>'balance_due')::numeric then
   raise exception 'payment_snapshot_mismatch';
  end if;
  src:=src||jsonb_build_object('payments',ps);
 end if;
 select jsonb_build_object('name',name,'timezone',timezone) into co from public.companies where id=p_company;
 insert into public.commercial_documents(company_id,kind,record_id,customer_id,record_version,number,snapshot,created_by)
 values(p_company,p_kind,p_record,(src->>'customer_id')::uuid,p_version,src->>'number',jsonb_build_object('company',co,'record',src),auth.uid())
 on conflict(company_id,kind,record_id,record_version) do nothing;
 select * into d from public.commercial_documents where company_id=p_company and kind=p_kind and record_id=p_record and record_version=p_version;
 return d;
end;$$;
revoke all on function public.prepare_commercial_document(uuid,text,uuid,integer) from public,anon;
grant execute on function public.prepare_commercial_document(uuid,text,uuid,integer) to authenticated;
commit;
