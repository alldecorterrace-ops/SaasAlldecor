-- Prepared private receipts survive failed batches; no business-data import.
begin;
alter table public.expenses add column receipt_sha256 text check(receipt_sha256 ~ '^[0-9a-f]{64}$');
create unique index expenses_receipt_unique on public.expenses(company_id,receipt_sha256)
 where receipt_sha256 is not null and status<>'ANULADO';
create table public.expense_receipt_uploads(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 batch_id uuid not null,expense_id uuid not null,actor_id uuid not null references auth.users(id),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),bytes integer not null check(bytes between 400 and 8388608),
 extension text not null check(extension in ('png','jpg','webp')),created_at timestamptz not null default now(),
 unique(company_id,batch_id,expense_id,actor_id,sha256),unique(company_id,id)
);
alter table public.expense_receipt_uploads enable row level security;
revoke all on public.expense_receipt_uploads from public,anon,authenticated;
grant select on public.expense_receipt_uploads to authenticated;
create policy expense_receipt_uploads_read on public.expense_receipt_uploads for select to authenticated using(
 actor_id=auth.uid() and app_private.is_manager(company_id) and app_private.can_access(company_id,'gastos','write'));
create function public.prepare_expense_batch_receipt(p_company uuid,p_batch uuid,p_expense uuid,p_sha256 text,p_bytes integer,p_extension text)
returns public.expense_receipt_uploads language plpgsql security definer set search_path='' as $$
declare u public.expense_receipt_uploads;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_batch is null or p_expense is null or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 400 and 8388608 or p_extension is null or p_extension not in ('png','jpg','webp') then raise exception 'invalid_receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':expense-batches',0));
 select * into u from public.expense_receipt_uploads where company_id=p_company and batch_id=p_batch and expense_id=p_expense and actor_id=auth.uid() and sha256=p_sha256;
 if found then
  if u.bytes<>p_bytes or u.extension<>p_extension then raise exception 'invalid_receipt';end if;
  return u;
 end if;
 if exists(select 1 from public.expense_batches where company_id=p_company and id=p_batch) or exists(select 1 from public.expenses where id=p_expense) then raise exception 'expense_batch_conflict' using errcode='PT409';end if;
 if exists(select 1 from public.expenses where company_id=p_company and receipt_sha256=p_sha256 and status<>'ANULADO') then raise exception 'duplicate_expense_receipt';end if;
 -- Bound abandoned candidates per batch while allowing corrections without deleting files.
 if (select count(*) from public.expense_receipt_uploads where company_id=p_company and batch_id=p_batch)>=300 then raise exception 'receipt_upload_limit';end if;
 insert into public.expense_receipt_uploads(company_id,batch_id,expense_id,actor_id,sha256,bytes,extension)
 values(p_company,p_batch,p_expense,auth.uid(),p_sha256,p_bytes,p_extension) returning * into u;
 return u;
end;$$;
revoke all on function public.prepare_expense_batch_receipt(uuid,uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.prepare_expense_batch_receipt(uuid,uuid,uuid,text,integer,text) to authenticated;

-- Existing files retain their original policy. A candidate is readable only by its
-- authorized creator until its expense exists. No UPDATE/DELETE policy is added.
create function app_private.expense_candidate_access(p_name text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_action in ('read','write') and exists(
  select 1 from public.expense_receipt_uploads u where p_name=u.company_id::text||'/'||u.expense_id::text||'/'||u.id::text||'.'||u.extension
  and u.actor_id=auth.uid() and app_private.is_manager(u.company_id) and app_private.can_access(u.company_id,'gastos','write')
  and (p_action='read' or not exists(select 1 from public.expense_batches b where b.company_id=u.company_id and b.id=u.batch_id))
 ),false);
$$;
revoke all on function app_private.expense_candidate_access(text,text) from public,anon;
grant execute on function app_private.expense_candidate_access(text,text) to authenticated;
create policy expense_candidate_read on storage.objects for select to authenticated using(bucket_id='expense-receipts' and app_private.expense_candidate_access(name,'read'));
create policy expense_candidate_insert on storage.objects for insert to authenticated with check(bucket_id='expense-receipts' and app_private.expense_candidate_access(name,'write'));
update storage.buckets set file_size_limit=8388608 where id='expense-receipts';

-- Old clients may replace/detach a receipt. Never leave a stale hash attached to it.
create function app_private.expense_receipt_digest() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.receipt_path is distinct from old.receipt_path then
  new.receipt_sha256:=(select u.sha256 from public.expense_receipt_uploads u where u.company_id=new.company_id and u.expense_id=new.id
    and new.receipt_path=u.company_id::text||'/'||u.expense_id::text||'/'||u.id::text||'.'||u.extension);
 end if;
 return new;
end;$$;
revoke all on function app_private.expense_receipt_digest() from public,anon,authenticated;
create trigger expense_receipt_digest before insert or update on public.expenses for each row execute function app_private.expense_receipt_digest();
create or replace function public.save_expense_batch(p_company uuid,p_batch uuid,p_rows jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare prior public.expense_batches; hash text; row_data jsonb; row_id uuid; ids uuid[]:='{}';n integer:=0;pay text; code text; receipt public.expense_receipt_uploads; file_path text;
begin
 if not app_private.is_manager(p_company) or not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_batch is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>1500000 then
  raise exception 'invalid_expense_batch' using errcode='22023';end if;
 hash:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 -- Serialize batch submissions per company before checking the durable receipt.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':expense-batches',0));
 select * into prior from public.expense_batches where company_id=p_company and id=p_batch;
 if found then
  if prior.actor_id<>auth.uid() or prior.request_hash<>hash then raise exception 'expense_batch_conflict' using errcode='PT409';end if;
  return prior.expense_ids;
 end if;
 for row_data in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;
  begin
   if jsonb_typeof(row_data)<>'object' or exists(select 1 from jsonb_object_keys(row_data) k where k not in
    ('id','project_id','worker_id','expense_date','category','description','vendor','document_number','amount','method','payer','receipt_id')) then
    raise exception 'invalid_expense';end if;
   row_id:=(row_data->>'id')::uuid;pay:=row_data->>'payer';
   if row_id is null or row_id=any(ids) or pay is null or pay not in ('EMPRESA','EFECTIVO_EMPRESA','TRABAJADOR') then raise exception 'invalid_expense';end if;
   if coalesce(row_data->>'amount','')!~'^[0-9]{1,8}(\.[0-9]{1,2})?$' or (row_data->>'amount')::numeric>10000000 or length(coalesce(row_data->>'description',''))>500 then raise exception 'invalid_amount_or_description';end if;
   if coalesce(row_data->>'expense_date','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_date';end if;
   receipt:=null;file_path:=null;
   if nullif(row_data->>'receipt_id','') is not null then
    select * into receipt from public.expense_receipt_uploads u where u.company_id=p_company and u.id=(row_data->>'receipt_id')::uuid and u.batch_id=p_batch and u.expense_id=row_id and u.actor_id=auth.uid();
    if not found then raise exception 'receipt_unavailable';end if;
    file_path:=p_company::text||'/'||row_id::text||'/'||receipt.id::text||'.'||receipt.extension;
    if not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=file_path) then raise exception 'receipt_unavailable';end if;
    if exists(select 1 from public.expenses where company_id=p_company and receipt_sha256=receipt.sha256 and status<>'ANULADO') then raise exception 'duplicate_expense_receipt';end if;
   end if;
   perform public.save_expense(p_company,row_id,0,row_data||jsonb_build_object(
    'status','APROBADO','reimbursement_status',case when pay='TRABAJADOR' then 'PENDIENTE' else 'NO_APLICA' end,
    'decision_note','Registrado por administración.'));
   if file_path is not null then update public.expenses set receipt_path=file_path where company_id=p_company and id=row_id;end if;
   ids:=array_append(ids,row_id);
  exception when others then
   -- Never expose names or data from a duplicate belonging to another tenant.
   code:=case when sqlstate='23505' then 'duplicate_expense_document' when sqlstate='42501' then 'permission_denied'
    when sqlerrm in ('worker_required','worker_unavailable','project_unavailable','invalid_payer','invalid_amount_or_description','invalid_date','receipt_unavailable','duplicate_expense_receipt') then sqlerrm else 'invalid_expense' end;
   raise exception 'expense_batch_row_%:%',n,code using errcode='22023';
  end;
 end loop;
 insert into public.expense_batches(company_id,id,actor_id,request_hash,expense_ids) values(p_company,p_batch,auth.uid(),hash,ids);
 return ids;
end;$$;
revoke all on function public.save_expense_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_expense_batch(uuid,uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
