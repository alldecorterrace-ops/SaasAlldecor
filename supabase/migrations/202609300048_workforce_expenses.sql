-- Workforce receipt submission and two-stage decisions. No business imports.
begin;
create table public.workforce_receipt_uploads (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 expense_id uuid not null, actor_id uuid not null references auth.users(id),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), bytes integer not null check(bytes between 1 and 8388608),
 extension text not null check(extension in ('jpg','png','webp','heic','heif')),
 original_name text not null check(length(original_name) between 1 and 200), created_at timestamptz not null default now(),
 unique(company_id,id), unique(company_id,expense_id,actor_id,sha256)
);
create table public.workforce_expenses (
 id uuid primary key, company_id uuid not null references public.companies(id), worker_id uuid not null,
 project_id uuid not null, expense_at timestamptz not null, amount numeric(12,2) not null check(amount>0 and amount<=10000),
 category text not null check(category in ('FUEL','MATERIALS','TOOLS','PARKING','TOLLS','OTHER')),
 description text not null default '' check(length(description)<=1000),
 status text not null default 'SUBMITTED' check(status in ('SUBMITTED','FOREMAN_APPROVED','OFFICE_APPROVED','REJECTED')),
 receipt_id uuid not null, version integer not null default 1,
 foreman_worker_id uuid,foreman_by uuid references auth.users(id),foreman_at timestamptz,foreman_reason text,
 office_worker_id uuid,office_by uuid references auth.users(id),office_at timestamptz,office_reason text,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,worker_id) references public.workers(company_id,id),
 foreign key(company_id,project_id) references public.projects(company_id,id),
 foreign key(company_id,foreman_worker_id) references public.workers(company_id,id),
 foreign key(company_id,office_worker_id) references public.workers(company_id,id),
 foreign key(company_id,receipt_id) references public.workforce_receipt_uploads(company_id,id)
);
create index workforce_expenses_scope on public.workforce_expenses(company_id,worker_id,expense_at desc,id);
create table app_private.workforce_expense_requests (
 company_id uuid not null references public.companies(id),actor_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(), primary key(company_id,actor_id,request_id)
);
revoke all on app_private.workforce_expense_requests from public,anon,authenticated;
alter table public.workforce_receipt_uploads enable row level security;
alter table public.workforce_expenses enable row level security;
revoke all on public.workforce_receipt_uploads,public.workforce_expenses from public,anon,authenticated;
grant select on public.workforce_receipt_uploads,public.workforce_expenses to authenticated;
create function app_private.can_read_workforce_expense(p_company uuid,p_worker uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.can_access(p_company,'horasfix','read') and app_private.can_view_workforce_worker(p_company,p_worker);
$$;
create function app_private.can_prepare_workforce_receipt(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.can_access(p_company,'horasfix','write') and (app_private.workforce_actor(p_company)).id is not null;
$$;
revoke all on function app_private.can_read_workforce_expense(uuid,uuid),app_private.can_prepare_workforce_receipt(uuid) from public,anon;
grant execute on function app_private.can_read_workforce_expense(uuid,uuid),app_private.can_prepare_workforce_receipt(uuid) to authenticated;
create policy workforce_expenses_read on public.workforce_expenses for select to authenticated using(app_private.can_read_workforce_expense(company_id,worker_id));
create policy workforce_receipt_creator_read on public.workforce_receipt_uploads for select to authenticated using(actor_id=auth.uid() and app_private.can_prepare_workforce_receipt(company_id));
create trigger workforce_expenses_audit after insert or update on public.workforce_expenses for each row execute function app_private.audit_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('workforce-receipts','workforce-receipts',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif']);
create function app_private.workforce_receipt_access(p_name text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_action in ('read','write') and exists(select 1 from public.workforce_receipt_uploads u
 where p_name=u.company_id::text||'/'||u.expense_id::text||'/'||u.id::text||'.'||u.extension and (
  (not exists(select 1 from public.workforce_expenses e where e.company_id=u.company_id and e.id=u.expense_id)
   and u.actor_id=auth.uid() and app_private.can_access(u.company_id,'horasfix','write') and (app_private.workforce_actor(u.company_id)).id is not null)
  or (p_action='read' and exists(select 1 from public.workforce_expenses e where e.company_id=u.company_id and e.receipt_id=u.id
   and app_private.can_access(e.company_id,'horasfix','read') and app_private.can_view_workforce_worker(e.company_id,e.worker_id)))
 )),false);
$$;
revoke all on function app_private.workforce_receipt_access(text,text) from public,anon;
grant execute on function app_private.workforce_receipt_access(text,text) to authenticated;
create policy workforce_receipt_read on storage.objects for select to authenticated using(bucket_id='workforce-receipts' and app_private.workforce_receipt_access(name,'read'));
create policy workforce_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='workforce-receipts' and app_private.workforce_receipt_access(name,'write'));
-- No overwrite/delete policy: uploaded evidence is immutable.
create function public.prepare_workforce_receipt(p_company uuid,p_expense uuid,p_sha256 text,p_bytes integer,p_extension text,p_name text)
returns public.workforce_receipt_uploads language plpgsql security definer set search_path='' as $$
declare u public.workforce_receipt_uploads;
begin
 if not app_private.can_access(p_company,'horasfix','write') or (app_private.workforce_actor(p_company)).id is null then raise exception 'worker_login_required' using errcode='42501';end if;
 if p_expense is null or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 8388608 or p_extension is null or p_extension not in ('jpg','png','webp','heic','heif') or p_name is null or length(p_name) not between 1 and 200 or p_name ~ '[[:cntrl:]/\\]' then raise exception 'invalid_workforce_receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-upload:'||p_expense::text,0));
 select * into u from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_expense and actor_id=auth.uid() and sha256=p_sha256;
 if found then
  if u.bytes<>p_bytes or u.extension<>p_extension or u.original_name<>p_name then raise exception 'receipt_mismatch';end if;
  return u;
 end if;
 if exists(select 1 from public.workforce_expenses where id=p_expense) then raise exception 'record_conflict' using errcode='PT409';end if;
 if (select count(*) from public.workforce_receipt_uploads where company_id=p_company and expense_id=p_expense)>=30 then raise exception 'receipt_upload_limit';end if;
 insert into public.workforce_receipt_uploads(company_id,expense_id,actor_id,sha256,bytes,extension,original_name)
 values(p_company,p_expense,auth.uid(),p_sha256,p_bytes,p_extension,p_name) returning * into u;
 return u;
end;$$;
create function public.submit_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_project uuid,p_at timestamptz,p_amount numeric,p_category text,p_description text,p_receipt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;u public.workforce_receipt_uploads;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;
begin
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null or not app_private.can_access(p_company,'horasfix','write') then raise exception 'worker_login_required' using errcode='42501';end if;
 if p_request is null or p_id is null or p_at is null or not isfinite(p_at) or p_at<now()-interval '90 days' or p_at>now()+interval '5 minutes' or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or round(p_amount,2)<=0 or round(p_amount,2)>10000 or p_category is null or p_category not in ('FUEL','MATERIALS','TOOLS','PARKING','TOLLS','OTHER') or p_description is null or length(trim(p_description))>1000 then raise exception 'invalid_workforce_expense';end if;
 if not app_private.can_use_workforce_project(p_company,p_project,p_at) then raise exception 'project_not_assigned' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','submit','id',p_id,'worker',actor.id,'project',p_project,'at',p_at,'amount',round(p_amount,2),'category',p_category,'description',trim(p_description),'receipt',p_receipt);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-upload:'||p_id::text,0));
 if exists(select 1 from public.workforce_expenses where id=p_id) then raise exception 'record_conflict' using errcode='PT409';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and id=p_receipt and expense_id=p_id and actor_id=auth.uid();
 if not found or not exists(select 1 from storage.objects where bucket_id='workforce-receipts' and name=p_company::text||'/'||p_id::text||'/'||u.id::text||'.'||u.extension) then raise exception 'receipt_unavailable';end if;
 insert into public.workforce_expenses(id,company_id,worker_id,project_id,expense_at,amount,category,description,receipt_id,created_by)
 values(p_id,p_company,actor.id,p_project,p_at,round(p_amount,2),p_category,trim(p_description),u.id,auth.uid());
 result:=jsonb_build_object('id',p_id,'version',1,'status','SUBMITTED');
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
create function public.decide_workforce_expense(p_company uuid,p_request uuid,p_id uuid,p_version integer,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;e public.workforce_expenses;prior app_private.workforce_expense_requests;payload jsonb;result jsonb;role_name text;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 role_name:=case when app_private.is_manager(p_company) then 'ADMIN' else actor.role end;
 if p_request is null or p_id is null or p_version is null or p_version<1 or p_decision is null or p_decision not in ('APPROVE','REJECT') or p_reason is null or length(trim(p_reason))>1000 or (p_decision='REJECT' and length(trim(p_reason))<5) then raise exception 'invalid_workforce_decision';end if;
 if role_name is null or role_name not in ('FOREMAN','OFFICE','ADMIN') then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_view_workforce_worker(p_company,e.worker_id) or (role_name='FOREMAN' and actor.id=e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 payload:=jsonb_build_object('operation','decision','id',p_id,'version',p_version,'decision',p_decision,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':wf-request:'||auth.uid()::text||':'||p_request::text,0));
 select * into prior from app_private.workforce_expense_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if prior.payload=payload then return prior.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id for update;
 if not app_private.can_view_workforce_worker(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if role_name='FOREMAN' and e.status='SUBMITTED' then
  update public.workforce_expenses set status=case when p_decision='APPROVE' then 'FOREMAN_APPROVED' else 'REJECTED' end,
   foreman_worker_id=actor.id,foreman_by=auth.uid(),foreman_at=now(),foreman_reason=trim(p_reason),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 elsif role_name in ('OFFICE','ADMIN') and e.status='FOREMAN_APPROVED' then
  update public.workforce_expenses set status=case when p_decision='APPROVE' then 'OFFICE_APPROVED' else 'REJECTED' end,
   office_worker_id=actor.id,office_by=auth.uid(),office_at=now(),office_reason=trim(p_reason),version=version+1,updated_at=now() where company_id=p_company and id=p_id;
 else raise exception 'expense_state_invalid' using errcode='PT409';end if;
 select jsonb_build_object('id',id,'version',version,'status',status) into result from public.workforce_expenses where company_id=p_company and id=p_id;
 insert into app_private.workforce_expense_requests values(p_company,auth.uid(),p_request,payload,result,now());
 return result;
end;$$;
-- Names for visible expenses only; team scope never grants general project access.
create function public.workforce_expense_names(p_company uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)>20 then raise exception 'invalid_expense_list';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'worker_name',w.name,'project_name',p.name)),'[]')
 from public.workforce_expenses e join public.workers w on w.company_id=e.company_id and w.id=e.worker_id
 join public.projects p on p.company_id=e.company_id and p.id=e.project_id
 where e.company_id=p_company and e.id=any(p_ids) and app_private.can_view_workforce_worker(e.company_id,e.worker_id));
end;$$;
revoke all on function public.workforce_expense_names(uuid,uuid[]) from public,anon;
grant execute on function public.workforce_expense_names(uuid,uuid[]) to authenticated;
-- This receipt locator is authenticated and reveals no file path to the browser.
create function public.workforce_expense_receipt(p_company uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.workforce_expenses;u public.workforce_receipt_uploads;
begin
 select * into e from public.workforce_expenses where company_id=p_company and id=p_id;
 if not found or not app_private.can_access(p_company,'horasfix','read') or not app_private.can_view_workforce_worker(p_company,e.worker_id) then raise exception 'expense_forbidden' using errcode='42501';end if;
 select * into u from public.workforce_receipt_uploads where company_id=p_company and id=e.receipt_id;
 return jsonb_build_object('id',u.id,'company_id',u.company_id,'expense_id',u.expense_id,'sha256',u.sha256,'bytes',u.bytes,'extension',u.extension,'original_name',u.original_name);
end;$$;
revoke all on function public.prepare_workforce_receipt(uuid,uuid,text,integer,text,text),public.submit_workforce_expense(uuid,uuid,uuid,uuid,timestamptz,numeric,text,text,uuid),public.decide_workforce_expense(uuid,uuid,uuid,integer,text,text),public.workforce_expense_receipt(uuid,uuid) from public,anon;
grant execute on function public.prepare_workforce_receipt(uuid,uuid,text,integer,text,text),public.submit_workforce_expense(uuid,uuid,uuid,uuid,timestamptz,numeric,text,text,uuid),public.decide_workforce_expense(uuid,uuid,uuid,integer,text,text),public.workforce_expense_receipt(uuid,uuid) to authenticated;
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'workforce_expenses' then 'horasfix' when 'workforce_profiles' then 'trabajadores' when 'workforce_assignments' then 'trabajadores' when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
create or replace function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity='workforce_expenses' then app_private.can_view_workforce_worker(p_company,(coalesce(p_after,p_before)->>'worker_id')::uuid) when p_entity in ('workforce_profiles','workforce_assignments') then app_private.is_manager(p_company) when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;

notify pgrst,'reload schema';
commit;
