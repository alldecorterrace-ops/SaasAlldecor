-- Recoverable workforce archive. No imports, accounting copies or payments.
begin;
alter table public.workforce_expenses drop constraint workforce_expenses_status_check;
alter table public.workforce_expenses add constraint workforce_expenses_status_check check(status in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED','REJECTED','NEEDS_CORRECTION','ARCHIVED')),
 add column archived_from_status text check(archived_from_status in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED','REJECTED','NEEDS_CORRECTION')),
 add column archived_by uuid references auth.users(id), add column archived_at timestamptz, add column archive_reason text,
 add column restored_by uuid references auth.users(id), add column restored_at timestamptz, add column restore_reason text,
 add constraint workforce_archive_evidence check(
  (archived_from_status is null and archived_by is null and archived_at is null and archive_reason is null and status<>'ARCHIVED')
  or (archived_from_status is not null and archived_by is not null and archived_at is not null and archive_reason is not null and length(trim(archive_reason)) between 5 and 500)
 ),
 add constraint workforce_restore_evidence check(
  (restored_by is null and restored_at is null and restore_reason is null)
  or (archived_from_status is not null and restored_by is not null and restored_at is not null and restore_reason is not null and length(trim(restore_reason)) between 5 and 500)
 );
create function app_private.can_read_workforce_expense_record(p_company uuid,p_expense uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workforce_expenses e where e.company_id=p_company and e.id=p_expense
 and app_private.can_read_workforce_expense(e.company_id,e.worker_id) and (e.status<>'ARCHIVED' or app_private.is_manager(e.company_id)));
$$;
revoke all on function app_private.can_read_workforce_expense_record(uuid,uuid) from public,anon;
grant execute on function app_private.can_read_workforce_expense_record(uuid,uuid) to authenticated;
drop policy workforce_expenses_read on public.workforce_expenses;
create policy workforce_expenses_read on public.workforce_expenses for select to authenticated using(app_private.can_read_workforce_expense_record(company_id,id));
create function public.archive_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_restore boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.workforce_expenses;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','write') or not app_private.is_manager(p_company) then raise exception 'expense_archive_forbidden' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_restore is null or p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'invalid_workforce_archive';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found then raise exception 'expense_archive_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation',case when p_restore then 'restore' else 'archive' end,'id',p_id,'version',p_version,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 if not app_private.can_access(p_company,'horasfix','write') or not app_private.is_manager(p_company) then raise exception 'expense_archive_forbidden' using errcode='42501';end if;
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 if not found or not app_private.can_access(p_company,'horasfix','write') or not app_private.is_manager(p_company) then raise exception 'expense_archive_forbidden' using errcode='42501';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if (p_restore and e.status<>'ARCHIVED') or (not p_restore and e.status='ARCHIVED') then raise exception 'expense_archive_state' using errcode='PT409';end if;
 if p_restore then
  update public.workforce_expenses set status=e.archived_from_status,restored_by=auth.uid(),restored_at=now(),restore_reason=trim(p_reason),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 else
  update public.workforce_expenses set status='ARCHIVED',archived_from_status=e.status,archived_by=auth.uid(),archived_at=now(),archive_reason=trim(p_reason),restored_by=null,restored_at=null,restore_reason=null,version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 end if;
 result:=jsonb_build_object('id',p_id,'version',p_version+1,'status',case when p_restore then e.archived_from_status else 'ARCHIVED' end,'archived',not p_restore);
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
revoke all on function public.archive_workforce_expense(uuid,uuid,uuid,integer,boolean,text) from public,anon;
grant execute on function public.archive_workforce_expense(uuid,uuid,uuid,integer,boolean,text) to authenticated;
create or replace function app_private.workforce_receipt_access(p_name text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_action in ('read','write') and exists(select 1 from public.workforce_receipt_uploads u
 where p_name=u.company_id::text||'/'||u.expense_id::text||'/'||u.id::text||'.'||u.extension and (
  (u.actor_id=auth.uid() and not app_private.workforce_receipt_used(u.company_id,u.expense_id,u.id) and (
   (not exists(select 1 from public.workforce_expenses e where e.id=u.expense_id) and app_private.can_prepare_workforce_receipt(u.company_id))
   or app_private.can_edit_workforce_receipt(u.company_id,u.expense_id)))
  or (p_action='read' and app_private.workforce_receipt_used(u.company_id,u.expense_id,u.id) and exists(select 1 from public.workforce_expenses e where e.company_id=u.company_id and e.id=u.expense_id and app_private.can_read_workforce_expense_record(e.company_id,e.id)))
  )),false);
$$;
create or replace function public.workforce_expense_receipt_version(p_company uuid,p_id uuid,p_receipt uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses;u public.workforce_receipt_uploads;
begin
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_read_workforce_expense_record(p_company,e.id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_id and id=p_receipt and (app_private.workforce_receipt_used(p_company,p_id,id) or (actor_id=auth.uid() and app_private.can_edit_workforce_receipt(p_company,p_id)));
 if not found then raise exception 'receipt_unavailable';end if;
 return jsonb_build_object('id',u.id,'company_id',u.company_id,'expense_id',u.expense_id,'sha256',u.sha256,'bytes',u.bytes,'extension',u.extension,'original_name',u.original_name);
end;$$;
create or replace function public.workforce_receipt_versions(p_company uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'invalid_receipt_query';end if;
 select coalesce(jsonb_agg(jsonb_build_object('expense_id',e.id,'receipts',(select jsonb_agg(jsonb_build_object('id',u.id,'original_name',u.original_name,'created_at',u.created_at,'current',u.id=e.receipt_id) order by u.created_at,u.id) from public.workforce_receipt_uploads u where u.company_id=e.company_id and u.expense_id=e.id and app_private.workforce_receipt_used(e.company_id,e.id,u.id))) order by e.id),'[]') into result
 from public.workforce_expenses e where e.company_id=p_company and e.id=any(p_ids) and app_private.can_read_workforce_expense_record(e.company_id,e.id);
 return result;
end;$$;
create or replace function public.workforce_expense_receipt(p_company uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses;u public.workforce_receipt_uploads;
begin
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_read_workforce_expense_record(p_company,e.id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and id=e.receipt_id;
 return jsonb_build_object('id',u.id,'company_id',u.company_id,'expense_id',u.expense_id,'sha256',u.sha256,'bytes',u.bytes,'extension',u.extension,'original_name',u.original_name);
end;$$;
create or replace function public.workforce_expense_names(p_company uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'invalid_expense_list';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'worker_name',w.name,'project_name',p.name)),'[]')
 from public.workforce_expenses e join public.workers w on w.company_id=e.company_id and w.id=e.worker_id
 join public.projects p on p.company_id=e.company_id and p.id=e.project_id
 where e.company_id=p_company and e.id=any(p_ids) and app_private.can_read_workforce_expense_record(e.company_id,e.id));
end;$$;
-- Candidate detection must run outside the expense RLS filter: hidden archived
-- rows must never be mistaken for expenses that have not yet been submitted.
create function app_private.can_read_workforce_receipt_upload(p_company uuid,p_expense uuid,p_receipt uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_actor=auth.uid() and (
  (not exists(select 1 from public.workforce_expenses e where e.id=p_expense) and app_private.can_prepare_workforce_receipt(p_company))
  or app_private.can_edit_workforce_receipt(p_company,p_expense)
  or (app_private.workforce_receipt_used(p_company,p_expense,p_receipt) and app_private.can_read_workforce_expense_record(p_company,p_expense))
 ),false);
$$;
revoke all on function app_private.can_read_workforce_receipt_upload(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function app_private.can_read_workforce_receipt_upload(uuid,uuid,uuid,uuid) to authenticated;
drop policy workforce_receipt_creator_read on public.workforce_receipt_uploads;
create policy workforce_receipt_creator_read on public.workforce_receipt_uploads for select to authenticated using(app_private.can_read_workforce_receipt_upload(company_id,expense_id,id,actor_id));
create or replace function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity='workforce_expenses' then app_private.can_read_workforce_expense_record(p_company,(coalesce(p_after,p_before)->>'id')::uuid) when p_entity in ('workforce_profiles','workforce_assignments') then app_private.is_manager(p_company) when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;
drop policy workforce_receipt_changes_read on public.workforce_receipt_changes;
create policy workforce_receipt_changes_read on public.workforce_receipt_changes for select to authenticated using(app_private.can_read_workforce_expense_record(company_id,expense_id));
create or replace function public.prepare_workforce_receipt(p_company uuid,p_expense uuid,p_sha256 text,p_bytes integer,p_extension text,p_name text)
returns public.workforce_receipt_uploads language plpgsql security definer set search_path='' as $$
declare u public.workforce_receipt_uploads;existing boolean;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'worker_login_required' using errcode='42501';end if;
 if p_expense is null or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 8388608 or p_extension is null or p_extension not in ('jpg','png','webp','heic','heif') or p_name is null or length(p_name) not between 1 and 200 or p_name ~ '[[:cntrl:]/\\]' then raise exception 'invalid_workforce_receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-upload:'||p_expense::text,0));
 select exists(select 1 from public.workforce_expenses where id=p_expense) into existing;
 if existing and not exists(select 1 from public.workforce_expenses e where e.id=p_expense and e.company_id=p_company and app_private.can_read_workforce_expense_record(e.company_id,e.id)) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if existing and (p_extension not in ('jpg','png','webp') or p_bytes<400) then raise exception 'invalid_workforce_receipt_replacement';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_expense and actor_id=auth.uid() and sha256=p_sha256;
 if found then
  if u.bytes<>p_bytes or u.extension<>p_extension or u.original_name<>p_name then raise exception 'receipt_mismatch';end if;
  if (existing and not (app_private.can_edit_workforce_receipt(p_company,p_expense) or app_private.workforce_receipt_used(p_company,p_expense,u.id))) or (not existing and not app_private.can_prepare_workforce_receipt(p_company)) then raise exception 'expense_forbidden' using errcode='42501';end if;
  return u;
 end if;
 if (existing and not app_private.can_edit_workforce_receipt(p_company,p_expense)) or (not existing and not app_private.can_prepare_workforce_receipt(p_company)) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if (select count(*) from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_expense)>=30 then raise exception 'receipt_upload_limit';end if;
 insert into public.workforce_receipt_uploads(company_id,expense_id,actor_id,sha256,bytes,extension,original_name) values(p_company,p_expense,auth.uid(),p_sha256,p_bytes,p_extension,p_name) returning * into u;
 return u;
end;$$;
notify pgrst,'reload schema';
commit;
