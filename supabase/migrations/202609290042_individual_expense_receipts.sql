-- Additive single-receipt preparation and durable retries; no historical import.
begin;
alter table public.expense_receipt_uploads alter column batch_id drop not null;
alter table public.expense_receipt_uploads add column expense_version integer;
alter table public.expense_receipt_uploads drop constraint expense_receipt_uploads_extension_check;
alter table public.expense_receipt_uploads drop constraint expense_receipt_uploads_bytes_check;
alter table public.expense_receipt_uploads add constraint expense_receipt_uploads_format_check check(
 extension in ('png','jpg','webp','pdf') and bytes between 12 and 8388608 and (extension='pdf' or bytes>=400)
 and ((batch_id is null and expense_version is not null and expense_version>=1) or (batch_id is not null and expense_version is null and extension<>'pdf')));
create unique index expense_single_receipt_retry on public.expense_receipt_uploads(company_id,expense_id,actor_id,expense_version,sha256) where batch_id is null;
create policy expense_single_receipt_read on public.expense_receipt_uploads for select to authenticated using(
 batch_id is null and actor_id=auth.uid() and app_private.can_access(company_id,'gastos','write'));
create table public.expense_receipt_changes(
 company_id uuid not null references public.companies(id),id uuid not null,expense_id uuid not null,
 actor_id uuid not null references auth.users(id),expense_version integer not null check(expense_version>=1),
 receipt_id uuid,result_version integer not null,created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,expense_id) references public.expenses(company_id,id),
 foreign key(company_id,receipt_id) references public.expense_receipt_uploads(company_id,id));
alter table public.expense_receipt_changes enable row level security;
revoke all on public.expense_receipt_changes from public,anon,authenticated;
grant select on public.expense_receipt_changes to authenticated;
create policy expense_receipt_changes_read on public.expense_receipt_changes for select to authenticated using(
 actor_id=auth.uid() and app_private.can_access(company_id,'gastos','write'));
create function public.prepare_expense_receipt(p_company uuid,p_expense uuid,p_version integer,p_sha256 text,p_bytes integer,p_extension text)
returns public.expense_receipt_uploads language plpgsql security definer set search_path='' as $$
declare e public.expenses;u public.expense_receipt_uploads;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_version is null or p_version<1 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 12 and 8388608
 or p_extension is null or p_extension not in ('png','jpg','webp','pdf') or (p_extension<>'pdf' and p_bytes<400) then raise exception 'invalid_receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':expense-batches',0));
 select * into e from public.expenses where company_id=p_company and id=p_expense for update;
 if not found or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status='ANULADO' and not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if exists(select 1 from public.expenses where company_id=p_company and id<>p_expense and receipt_sha256=p_sha256 and status<>'ANULADO') then raise exception 'duplicate_expense_receipt';end if;
 select * into u from public.expense_receipt_uploads where company_id=p_company and expense_id=p_expense and actor_id=auth.uid() and batch_id is null and expense_version=p_version and sha256=p_sha256;
 if found then
  if u.bytes<>p_bytes or u.extension<>p_extension then raise exception 'invalid_receipt';end if;
  return u;
 end if;
 if (select count(*) from public.expense_receipt_uploads where company_id=p_company and expense_id=p_expense and batch_id is null and expense_version=p_version)>=30 then raise exception 'receipt_upload_limit';end if;
 insert into public.expense_receipt_uploads(company_id,batch_id,expense_id,actor_id,sha256,bytes,extension,expense_version)
 values(p_company,null,p_expense,auth.uid(),p_sha256,p_bytes,p_extension,p_version) returning * into u;
 return u;
end;$$;
create function public.set_prepared_expense_receipt(p_company uuid,p_expense uuid,p_version integer,p_request uuid,p_receipt uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare e public.expenses;u public.expense_receipt_uploads;prior public.expense_receipt_changes;path text;result integer;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_version is null or p_version<1 then raise exception 'invalid_receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':expense-batches',0));
 select * into prior from public.expense_receipt_changes where company_id=p_company and id=p_request;
 if found then
  if prior.actor_id<>auth.uid() or prior.expense_id is distinct from p_expense or prior.expense_version<>p_version or prior.receipt_id is distinct from p_receipt then raise exception 'receipt_request_conflict' using errcode='PT409';end if;
  return prior.result_version;
 end if;
 select * into e from public.expenses where company_id=p_company and id=p_expense for update;
 if not found or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status='ANULADO' and not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_receipt is not null then
  select * into u from public.expense_receipt_uploads where company_id=p_company and id=p_receipt and expense_id=p_expense and actor_id=auth.uid() and batch_id is null and expense_version=p_version;
  if not found then raise exception 'receipt_unavailable';end if;
  path:=p_company::text||'/'||p_expense::text||'/'||u.id::text||'.'||u.extension;
  if not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=path) then raise exception 'receipt_unavailable';end if;
  if exists(select 1 from public.expenses where company_id=p_company and id<>p_expense and receipt_sha256=u.sha256 and status<>'ANULADO') then raise exception 'duplicate_expense_receipt';end if;
 end if;
 -- An identical receipt is a no-op, including approval and version.
 if e.receipt_path is distinct from path and (p_receipt is null or e.receipt_sha256 is distinct from u.sha256) then
  perform public.set_expense_receipt(p_company,p_expense,p_version,path);
 end if;
 select version into result from public.expenses where company_id=p_company and id=p_expense;
 insert into public.expense_receipt_changes(company_id,id,expense_id,actor_id,expense_version,receipt_id,result_version)
 values(p_company,p_request,p_expense,auth.uid(),p_version,p_receipt,result);
 return result;
end;$$;
revoke all on function public.prepare_expense_receipt(uuid,uuid,integer,text,integer,text),public.set_prepared_expense_receipt(uuid,uuid,integer,uuid,uuid) from public,anon;
grant execute on function public.prepare_expense_receipt(uuid,uuid,integer,text,integer,text),public.set_prepared_expense_receipt(uuid,uuid,integer,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
