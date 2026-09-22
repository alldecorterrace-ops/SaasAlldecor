-- No activation, adapters, clearance or business records are installed here.
begin;
alter table app_private.operation_requests add column enqueue_sequence bigint generated always as identity;
create unique index operation_enqueue_sequence on app_private.operation_requests(enqueue_sequence);
alter table app_private.operation_requests alter column authority drop not null;
alter table app_private.operation_requests alter column epoch drop not null;
alter table app_private.operation_requests add constraint operation_assignment check((authority is null)=(epoch is null));

create table app_private.operation_adapters (
  action text not null references app_private.operation_handlers(action),
  authority text not null check(authority in ('adt','saas')),
  verified boolean not null default false,
  evidence_sha256 text check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  primary key(action,authority),
  check(not verified or evidence_sha256 is not null)
);
-- Legacy handler booleans are not evidence of a transactional adapter.
insert into app_private.operation_adapters(action,authority)
  select action,authority from app_private.operation_handlers;
create table app_private.transition_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  from_authority text not null check(from_authority in ('adt','saas')),
  from_epoch bigint not null,
  cutoff bigint not null check(cutoff>=0),
  status text not null default 'draining' check(status in ('draining','completed')),
  created_by uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table app_private.transition_controls add column transition_id uuid references app_private.transition_sessions(id);
-- Upgrade a legacy paused queue by treating existing requests as before the cut.
insert into app_private.transition_sessions(company_id,from_authority,from_epoch,cutoff,created_by)
  select c.company_id,c.authority,c.epoch,coalesce((select max(r.enqueue_sequence) from app_private.operation_requests r where r.company_id=c.company_id),0),p.created_by
  from app_private.transition_controls c join public.companies p on p.id=c.company_id where c.phase='draining';
update app_private.transition_controls c set transition_id=t.id from app_private.transition_sessions t where t.company_id=c.company_id;
alter table app_private.transition_controls add constraint transition_phase_session check((phase='draining')=(transition_id is not null));

-- Administrative attestations point to private evidence; never browser assertions.
create table app_private.transition_clearances (
  transition_id uuid primary key references app_private.transition_sessions(id),
  verified_by uuid not null references auth.users(id),
  inventory_sha256 text not null check(inventory_sha256 ~ '^[a-f0-9]{64}$'),
  reconciliation_sha256 text not null check(reconciliation_sha256 ~ '^[a-f0-9]{64}$'),
  recovery_sha256 text not null check(recovery_sha256 ~ '^[a-f0-9]{64}$'),
  audit_sha256 text not null check(audit_sha256 ~ '^[a-f0-9]{64}$'),
  source_fence_sha256 text not null check(source_fence_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check(expires_at>verified_at and expires_at<=verified_at+interval '15 minutes')
);
create table app_private.operation_effects (
  company_id uuid not null,
  request_id uuid not null,
  entity text not null,
  entity_id uuid not null,
  entity_version integer not null,
  before_data jsonb,
  after_data jsonb not null,
  change_sequence bigint generated always as identity unique,
  committed_at timestamptz not null default now(),
  primary key(company_id,request_id),
  foreign key(company_id,request_id) references app_private.operation_requests(company_id,id)
);
alter table app_private.operation_adapters enable row level security;
alter table app_private.transition_sessions enable row level security;
alter table app_private.transition_clearances enable row level security;
alter table app_private.operation_effects enable row level security;
revoke all on app_private.operation_adapters,app_private.transition_sessions,app_private.transition_clearances,app_private.operation_effects from public,anon,authenticated;

create or replace function public.enqueue_operation(p_company uuid,p_request uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.transition_controls; h app_private.operation_handlers;
  r app_private.operation_requests; uid uuid:=auth.uid();
begin
  if uid is null or not app_private.is_member(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_request is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then
    raise exception 'invalid_request' using errcode='22023'; end if;
  select * into h from app_private.operation_handlers where action=p_action;
  if not found or not app_private.can_access(p_company,h.module_id,'write') then raise exception 'permission_denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_request::text,0));
  select * into r from app_private.operation_requests where company_id=p_company and id=p_request;
  if found then
    if r.actor_id<>uid or r.action<>p_action or r.payload<>p_payload then raise exception 'request_conflict' using errcode='23505'; end if;
    return jsonb_build_object('id',r.id,'status',r.status,'replayed',true);
  end if;
  -- This shared serialization point defines which side of a cut an insert belongs to.
  select * into c from app_private.transition_controls where company_id=p_company for update;
  if not found or c.phase='disabled' or not exists(select 1 from app_private.operation_adapters a
    where a.action=p_action and a.authority=c.authority and a.verified) then raise exception 'queue_unavailable' using errcode='55000'; end if;
  if (select count(*) from app_private.operation_requests where company_id=p_company and status in ('queued','processing','review'))>=1000 then
    raise exception 'queue_capacity' using errcode='54000'; end if;
  insert into app_private.operation_requests(company_id,id,actor_id,action,module_id,payload,payload_sha256,authority,epoch)
    values(p_company,p_request,uid,p_action,h.module_id,p_payload,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),
      case when c.phase='accepting' then c.authority end,case when c.phase='accepting' then c.epoch end);
  insert into app_private.operation_events(company_id,request_id,status) values(p_company,p_request,'queued');
  return jsonb_build_object('id',p_request,'status','queued','replayed',false);
end; $$;

create or replace function public.get_transition_status(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c app_private.transition_controls; t app_private.transition_sessions;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into c from app_private.transition_controls where company_id=p_company;
  select * into t from app_private.transition_sessions where id=c.transition_id;
  return jsonb_build_object('authority',coalesce(c.authority,'adt'),'phase',coalesce(c.phase,'disabled'),
    'epoch',coalesce(c.epoch,1),'transitionId',t.id,'cutoff',t.cutoff,'cutoverAvailable',false,
    'pending',(select count(*) from app_private.operation_requests where company_id=p_company and status in ('queued','processing','review')),
    'held',(select count(*) from app_private.operation_requests where company_id=p_company and authority is null),
    'beforeCutPending',(select count(*) from app_private.operation_requests where company_id=p_company and enqueue_sequence<=t.cutoff and status in ('queued','processing','review')));
end; $$;

create or replace function public.pause_operation_queue(p_company uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.transition_controls; tid uuid;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into c from app_private.transition_controls where company_id=p_company for update;
  if found and c.phase='accepting' then
    insert into app_private.transition_sessions(company_id,from_authority,from_epoch,cutoff,created_by)
      values(p_company,c.authority,c.epoch,coalesce((select max(enqueue_sequence) from app_private.operation_requests where company_id=p_company),0),auth.uid()) returning id into tid;
    update app_private.transition_controls set phase='draining',transition_id=tid,updated_at=now() where company_id=p_company;
    insert into app_private.transition_events(company_id,actor_id,authority,epoch,phase) values(p_company,auth.uid(),c.authority,c.epoch,'draining');
  end if;
  return public.get_transition_status(p_company);
end; $$;

create function app_private.claim_operation_for_action(p_company uuid,p_authority text,p_epoch bigint,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c app_private.transition_controls; t app_private.transition_sessions; r app_private.operation_requests;
  m public.memberships;
begin
  select * into c from app_private.transition_controls where company_id=p_company for update;
  if not found or c.phase='disabled' or c.authority<>p_authority or c.epoch<>p_epoch then return null; end if;
  if c.phase='draining' then
    select * into t from app_private.transition_sessions where id=c.transition_id and status='draining';
    if not found then return null; end if;
  end if;
  select * into r from app_private.operation_requests where company_id=p_company and authority=p_authority and epoch=p_epoch
    and status='queued' and (p_action is null or action=p_action) and (c.phase='accepting' or enqueue_sequence<=t.cutoff)
    order by enqueue_sequence for update skip locked limit 1;
  if not found then return null; end if;
  select * into m from public.memberships where company_id=p_company and user_id=r.actor_id for share;
  if not found or not m.active or not exists(select 1 from auth.users where id=r.actor_id and email_confirmed_at is not null)
    or not (m.role in ('owner','admin') or coalesce(m.permissions->r.module_id ? 'write',false)) then
    update app_private.operation_requests set status='rejected',result_code='access_revoked',completed_at=now() where company_id=p_company and id=r.id;
    insert into app_private.operation_events(company_id,request_id,status) values(p_company,r.id,'rejected'); return null;
  end if;
  if not exists(select 1 from app_private.operation_adapters a where a.action=r.action and a.authority=p_authority and a.verified) then return null; end if;
  update app_private.operation_requests set status='processing',claim_token=gen_random_uuid(),claimed_at=now()
    where company_id=p_company and id=r.id returning * into r;
  insert into app_private.operation_events(company_id,request_id,status) values(p_company,r.id,'processing');
  return jsonb_build_object('id',r.id,'companyId',r.company_id,'actorId',r.actor_id,'action',r.action,'payload',r.payload,
    'payloadSha256',r.payload_sha256,'claimToken',r.claim_token,'authority',r.authority,'epoch',r.epoch);
end; $$;
create or replace function app_private.claim_operation(p_company uuid,p_authority text,p_epoch bigint)
returns jsonb language sql security definer set search_path='' as $$
  select app_private.claim_operation_for_action(p_company,p_authority,p_epoch,null);
$$;

-- Only an administrative, evidence-backed adapter may request this. No public API.
create function app_private.finalize_adt_transition(p_company uuid,p_transition uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare c app_private.transition_controls; t app_private.transition_sessions; proof app_private.transition_clearances;
begin
  select * into c from app_private.transition_controls where company_id=p_company for update;
  select * into t from app_private.transition_sessions where id=p_transition and company_id=p_company for update;
  if t.status='completed' and c.authority='saas' and c.epoch=t.from_epoch+1 then return c.epoch; end if;
  if c.phase is distinct from 'draining' or c.transition_id is distinct from p_transition or t.status is distinct from 'draining'
    or c.authority<>'adt' or t.from_authority<>'adt' or c.epoch<>t.from_epoch then raise exception 'transition_conflict' using errcode='40001'; end if;
  select * into proof from app_private.transition_clearances where transition_id=p_transition;
  if not found or proof.verified_at>clock_timestamp() or proof.verified_at<t.started_at or proof.expires_at<=clock_timestamp()
    or not exists(select 1 from public.memberships where company_id=p_company and user_id=proof.verified_by and role='owner' and active) then
    raise exception 'transition_not_cleared' using errcode='55000'; end if;
  if exists(select 1 from app_private.operation_requests where company_id=p_company and status in ('processing','review'))
    or exists(select 1 from app_private.operation_requests where company_id=p_company and enqueue_sequence<=t.cutoff and status='queued') then
    raise exception 'drain_incomplete' using errcode='55000'; end if;
  if exists(select 1 from app_private.operation_requests where company_id=p_company and enqueue_sequence>t.cutoff and (status<>'queued' or authority is not null)) then
    raise exception 'unexpected_post_cut_assignment' using errcode='55000'; end if;
  if exists(select 1 from app_private.operation_handlers h where not exists(select 1 from app_private.operation_adapters a where a.action=h.action and a.authority='saas' and a.verified)) then
    raise exception 'adapter_coverage_incomplete' using errcode='55000'; end if;
  update app_private.operation_requests set authority='saas',epoch=c.epoch+1 where company_id=p_company and authority is null and status='queued';
  update app_private.transition_controls set authority='saas',epoch=c.epoch+1,phase='accepting',transition_id=null,updated_at=now() where company_id=p_company;
  update app_private.transition_sessions set status='completed',completed_at=now() where id=p_transition;
  insert into app_private.transition_events(company_id,actor_id,authority,epoch,phase) values(p_company,proof.verified_by,'saas',c.epoch+1,'accepting');
  return c.epoch+1;
end; $$;

-- First native adapter. The effect, change record and queue result COMMIT together.
-- There are no network calls inside it. Other actions remain unimplemented.
create function app_private.execute_saas_customer_operation(p_company uuid,p_epoch bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare claim jsonb; body jsonb; rid uuid; cid uuid; before_row jsonb; after_row jsonb;
  previous_actor text:=current_setting('request.jwt.claim.sub',true); result_status text:='succeeded'; result_code text:='completed';
begin
  claim:=app_private.claim_operation_for_action(p_company,'saas',p_epoch,'customer.save');
  if claim is null then return null; end if;
  rid:=(claim->>'id')::uuid; body:=claim->'payload';
  perform set_config('request.jwt.claim.sub',claim->>'actorId',true);
  begin
    if (body->>'recordId') is null or (body->>'version') is null or jsonb_typeof(body->'data') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(body) k where k not in ('recordId','version','data')) then
      raise exception 'invalid_request' using errcode='22023'; end if;
    cid:=(body->>'recordId')::uuid;
    select to_jsonb(x) into before_row from public.customers x where company_id=p_company and id=cid for update;
    perform public.save_customer(p_company,cid,(body->>'version')::integer,body->'data');
    select to_jsonb(x) into after_row from public.customers x where company_id=p_company and id=cid;
    insert into app_private.operation_effects(company_id,request_id,entity,entity_id,entity_version,before_data,after_data)
      values(p_company,rid,'customers',cid,(after_row->>'version')::integer,before_row,after_row);
  exception when sqlstate '22023' or sqlstate '22P02' or sqlstate '22007' or sqlstate '22008' or sqlstate '23502' or sqlstate '23505' or sqlstate '23514' or sqlstate '40001' or sqlstate '42501' then
    result_status:='rejected'; result_code:='validation_or_access_failed'; cid:=null;
  when raise_exception then
    if SQLERRM<>'invalid_customer' then raise; end if;
    result_status:='rejected'; result_code:='validation_or_access_failed'; cid:=null;
  end;
  perform app_private.complete_operation(p_company,rid,(claim->>'claimToken')::uuid,result_status,cid::text,result_code);
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return jsonb_build_object('id',rid,'status',result_status,'resultReference',cid);
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  raise;
end; $$;
revoke all on function app_private.claim_operation_for_action(uuid,text,bigint,text),
  app_private.finalize_adt_transition(uuid,uuid),app_private.execute_saas_customer_operation(uuid,bigint) from public,anon,authenticated;
commit;
