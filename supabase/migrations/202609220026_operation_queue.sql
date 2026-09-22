-- Additive queue foundation. Disabled by default, with no registered handlers.
-- This does not redirect existing writes or authorize a production cutover.
begin;

create table app_private.transition_controls (
  company_id uuid primary key references public.companies(id),
  authority text not null default 'adt' check(authority in ('adt','saas')),
  phase text not null default 'disabled' check(phase in ('disabled','accepting','draining')),
  epoch bigint not null default 1 check(epoch > 0),
  updated_at timestamptz not null default now()
);
create table app_private.operation_handlers (
  action text primary key check(action ~ '^[a-z][a-z0-9_.]{2,79}$'),
  module_id text not null references public.module_catalog(id),
  authority text not null check(authority in ('adt','saas')),
  verified boolean not null default false
);
create table app_private.operation_requests (
  company_id uuid not null references public.companies(id),
  id uuid not null,
  actor_id uuid not null references auth.users(id),
  action text not null references app_private.operation_handlers(action),
  module_id text not null references public.module_catalog(id),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=32768),
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  authority text not null check(authority in ('adt','saas')),
  epoch bigint not null,
  status text not null default 'queued' check(status in ('queued','processing','succeeded','rejected','review')),
  claim_token uuid,
  claimed_at timestamptz,
  result_reference text check(length(result_reference)<=200),
  result_code text check(result_code ~ '^[a-z_]{2,60}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(company_id,id)
);
create index operation_pending on app_private.operation_requests(company_id,authority,epoch,created_at,id) where status='queued';
create table app_private.operation_events (
  sequence bigint generated always as identity primary key,
  company_id uuid not null,
  request_id uuid not null,
  status text not null,
  created_at timestamptz not null default now(),
  foreign key(company_id,request_id) references app_private.operation_requests(company_id,id)
);
create table app_private.transition_events (
  sequence bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  actor_id uuid not null references auth.users(id),
  authority text not null,
  epoch bigint not null,
  phase text not null,
  created_at timestamptz not null default now()
);
-- Private schema is not exposed through PostgREST. Also revoke table access and
-- enable RLS to prevent a later schema exposure from granting direct access.
alter table app_private.transition_controls enable row level security;
alter table app_private.operation_handlers enable row level security;
alter table app_private.operation_requests enable row level security;
alter table app_private.operation_events enable row level security;
alter table app_private.transition_events enable row level security;
revoke all on app_private.transition_controls,app_private.operation_handlers,
  app_private.operation_requests,app_private.operation_events,app_private.transition_events from public,anon,authenticated;

create function public.enqueue_operation(p_company uuid,p_request uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare control app_private.transition_controls; handler app_private.operation_handlers;
  prior app_private.operation_requests; fingerprint text; uid uuid:=auth.uid();
begin
  if uid is null or not app_private.is_member(p_company) then
    raise exception 'permission_denied' using errcode='42501'; end if;
  if p_request is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>32768 then raise exception 'invalid_request' using errcode='22023'; end if;
  select * into handler from app_private.operation_handlers where action=p_action;
  if not found or not app_private.can_access(p_company,handler.module_id,'write') then
    raise exception 'permission_denied' using errcode='42501'; end if;
  -- Serialize the same id even before its first insert. No company can collide
  -- with another company's business identity.
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_request::text,0));
  fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  select * into prior from app_private.operation_requests where company_id=p_company and id=p_request;
  if found then
    if prior.actor_id<>uid or prior.action<>p_action or prior.payload<>p_payload then
      raise exception 'request_conflict' using errcode='23505'; end if;
    return jsonb_build_object('id',prior.id,'status',prior.status,'replayed',true);
  end if;
  select * into control from app_private.transition_controls where company_id=p_company for update;
  if not found or control.phase='disabled' or not handler.verified or handler.authority<>control.authority then
    raise exception 'queue_unavailable' using errcode='55000'; end if;
  -- During draining accept durably but do not claim new work. A future cutover
  -- adapter must reconcile and assign pending requests before changing authority.
  if (select count(*) from app_private.operation_requests where company_id=p_company and status in ('queued','processing','review'))>=1000 then
    raise exception 'queue_capacity' using errcode='54000'; end if;
  insert into app_private.operation_requests(company_id,id,actor_id,action,module_id,payload,payload_sha256,authority,epoch)
    values(p_company,p_request,uid,p_action,handler.module_id,p_payload,fingerprint,control.authority,control.epoch);
  insert into app_private.operation_events(company_id,request_id,status) values(p_company,p_request,'queued');
  return jsonb_build_object('id',p_request,'status','queued','replayed',false);
end; $$;

create function public.get_operation_status(p_company uuid,p_request uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r app_private.operation_requests;
begin
  select * into r from app_private.operation_requests where company_id=p_company and id=p_request;
  if not found or not app_private.can_access(p_company,r.module_id,'read')
    or (r.actor_id<>auth.uid() and not app_private.is_manager(p_company)) then return null; end if;
  return jsonb_build_object('id',r.id,'status',r.status,'createdAt',r.created_at,
    'completedAt',r.completed_at,'resultReference',r.result_reference,'resultCode',r.result_code);
end; $$;

create function public.get_transition_status(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c app_private.transition_controls;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into c from app_private.transition_controls where company_id=p_company;
  return jsonb_build_object('authority',coalesce(c.authority,'adt'),'phase',coalesce(c.phase,'disabled'),
    'epoch',coalesce(c.epoch,1),'cutoverAvailable',false,
    'pending',(select count(*) from app_private.operation_requests where company_id=p_company and status in ('queued','processing','review')));
end; $$;

create function public.pause_operation_queue(p_company uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.transition_controls;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  update app_private.transition_controls set phase='draining',updated_at=now()
    where company_id=p_company and phase='accepting' returning * into c;
  if found then
    insert into app_private.transition_events(company_id,actor_id,authority,epoch,phase)
      values(p_company,auth.uid(),c.authority,c.epoch,c.phase);
  end if;
  return public.get_transition_status(p_company);
end; $$;

-- Internal worker boundary. No grants to browser roles or service_role: a
-- separate server credential/adapter needs an explicitly reviewed grant.
create function app_private.claim_operation(p_company uuid,p_authority text,p_epoch bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.transition_controls; r app_private.operation_requests; allowed boolean;
begin
  select * into c from app_private.transition_controls where company_id=p_company for update;
  if not found or c.phase<>'accepting' or c.authority<>p_authority or c.epoch<>p_epoch then return null; end if;
  select * into r from app_private.operation_requests where company_id=p_company and authority=p_authority
    and epoch=p_epoch and status='queued' order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  -- Recheck permissions at execution, after any revocation since enqueue.
  select exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id
    where m.company_id=p_company and m.user_id=r.actor_id and m.active and u.email_confirmed_at is not null
    and (m.role in ('owner','admin') or coalesce(m.permissions->r.module_id ? 'write',false))) into allowed;
  if not allowed then
    update app_private.operation_requests set status='rejected',result_code='access_revoked',completed_at=now()
      where company_id=p_company and id=r.id;
    insert into app_private.operation_events(company_id,request_id,status) values(p_company,r.id,'rejected');
    return null;
  end if;
  if not exists(select 1 from app_private.operation_handlers h where h.action=r.action and h.verified and h.authority=p_authority) then return null; end if;
  update app_private.operation_requests set status='processing',claim_token=gen_random_uuid(),claimed_at=now()
    where company_id=p_company and id=r.id returning * into r;
  insert into app_private.operation_events(company_id,request_id,status) values(p_company,r.id,'processing');
  return jsonb_build_object('id',r.id,'companyId',r.company_id,'actorId',r.actor_id,'action',r.action,
    'payload',r.payload,'payloadSha256',r.payload_sha256,'claimToken',r.claim_token,'authority',r.authority,'epoch',r.epoch);
end; $$;

create function app_private.complete_operation(p_company uuid,p_request uuid,p_claim uuid,p_status text,p_reference text,p_code text)
returns void language plpgsql security definer set search_path='' as $$
declare r app_private.operation_requests;
begin
  select * into r from app_private.operation_requests where company_id=p_company and id=p_request for update;
  if not found or p_claim is null or r.claim_token is distinct from p_claim then raise exception 'claim_conflict' using errcode='40001'; end if;
  if p_status is null or p_status not in ('succeeded','rejected','review') or p_code is null
    or p_code !~ '^[a-z_]{2,60}$' or length(p_reference)>200 or (p_status='succeeded' and nullif(trim(p_reference),'') is null) then
    raise exception 'invalid_result' using errcode='22023'; end if;
  if r.status=p_status and r.result_reference is not distinct from p_reference and r.result_code=p_code then return; end if;
  if r.status<>'processing' then raise exception 'result_conflict' using errcode='40001'; end if;
  update app_private.operation_requests set status=p_status,result_reference=p_reference,result_code=p_code,
    completed_at=case when p_status='review' then null else now() end where company_id=p_company and id=p_request;
  insert into app_private.operation_events(company_id,request_id,status) values(p_company,p_request,p_status);
end; $$;
-- A timeout is ambiguous, never permission to repeat a financial/business effect.
create function app_private.flag_stalled_operations(p_company uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare changed bigint;
begin
  with stalled as (
    update app_private.operation_requests set status='review',result_code='outcome_unknown'
      where company_id=p_company and status='processing' and claimed_at<now()-interval '15 minutes' returning id
  ) insert into app_private.operation_events(company_id,request_id,status) select p_company,id,'review' from stalled;
  get diagnostics changed=row_count;
  return changed;
end; $$;

revoke all on function public.enqueue_operation(uuid,uuid,text,jsonb),public.get_operation_status(uuid,uuid),
  public.get_transition_status(uuid),public.pause_operation_queue(uuid) from public,anon;
grant execute on function public.enqueue_operation(uuid,uuid,text,jsonb),public.get_operation_status(uuid,uuid),
  public.get_transition_status(uuid),public.pause_operation_queue(uuid) to authenticated;
revoke all on function app_private.claim_operation(uuid,text,bigint),
  app_private.complete_operation(uuid,uuid,uuid,text,text,text),app_private.flag_stalled_operations(uuid) from public,anon,authenticated;
commit;
