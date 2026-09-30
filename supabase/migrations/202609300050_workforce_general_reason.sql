-- Match ADT: a fresh versioned request may update the general allocation reason.
begin;
create or replace function public.decide_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;e public.workforce_expenses;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;role_name text;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 role_name:=case when app_private.is_manager(p_company) then 'ADMIN' else actor.role end;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_decision is null or p_decision not in ('APPROVE','REJECT','RECLASSIFY_GENERAL') or p_reason is null or length(trim(p_reason))>1000 or (p_decision in ('REJECT','RECLASSIFY_GENERAL') and length(trim(p_reason))<5) then raise exception 'invalid_workforce_decision';end if;
 if role_name is null or role_name not in ('FOREMAN','OFFICE','ADMIN') or (p_decision='RECLASSIFY_GENERAL' and role_name not in ('OFFICE','ADMIN')) then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_view_workforce_worker(p_company,e.worker_id) or (role_name='FOREMAN' and actor.id=e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','decision','id',p_id,'version',p_version,'decision',p_decision,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 if not app_private.can_view_workforce_worker(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_decision='RECLASSIFY_GENERAL' then
  if role_name not in ('OFFICE','ADMIN') then raise exception 'expense_forbidden' using errcode='42501';end if;
  if e.status not in ('FOREMAN_APPROVED','OFFICE_APPROVED') then raise exception 'expense_state_invalid' using errcode='PT409';end if;
  update public.workforce_expenses set allocation='GENERAL',general_by=auth.uid(),general_worker_id=actor.id,general_at=now(),general_reason=trim(p_reason),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 elsif role_name='FOREMAN' and e.status='SUBMITTED' then
  update public.workforce_expenses set status=case when p_decision='APPROVE' then 'FOREMAN_APPROVED' else 'REJECTED' end,
   foreman_worker_id=actor.id,foreman_by=auth.uid(),foreman_at=now(),foreman_reason=trim(p_reason),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 elsif role_name in ('OFFICE','ADMIN') and e.status='FOREMAN_APPROVED' then
  update public.workforce_expenses set status=case when p_decision='APPROVE' then 'OFFICE_APPROVED' else 'REJECTED' end,
   office_worker_id=actor.id,office_by=auth.uid(),office_at=now(),office_reason=trim(p_reason),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 else raise exception 'expense_state_invalid' using errcode='PT409';end if;
 select jsonb_build_object('id',id,'version',version,'status',status,'allocation',allocation) into result from public.workforce_expenses where company_id=p_company and id=p_id;
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
notify pgrst,'reload schema';
commit;
