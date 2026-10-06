-- Campo declarations and formal proposals; no business imports or rewrites.
begin;
create table public.time_field_proposals (
 id uuid primary key,company_id uuid not null,entry_id uuid not null,worker_id uuid not null,
 starts_at timestamptz not null,ends_at timestamptz,proposed_minutes integer not null check(proposed_minutes between 0 and 1080),
 original_starts_at timestamptz not null,original_ends_at timestamptz,original_minutes integer not null check(original_minutes>=0),
 reason text not null check(length(trim(reason)) between 1 and 240),
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','APROBADA','RECHAZADA','SUSTITUIDA','ANULADA')),
 foreman_minutes integer,foreman_by uuid references auth.users(id),foreman_at timestamptz,
 decision_note text not null default '',decided_minutes integer,version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,entry_id) references public.time_entries(company_id,id),foreign key(company_id,worker_id) references public.workers(company_id,id),
 check(ends_at is null or (ends_at>=starts_at and ends_at-starts_at<=interval '18 hours'))
);
create unique index time_field_one_pending on public.time_field_proposals(company_id,entry_id) where status='PENDIENTE';
create table public.time_field_declarations (
 id uuid primary key,company_id uuid not null,entry_id uuid not null,worker_id uuid not null,ends_at timestamptz not null,
 proposed_minutes integer not null check(proposed_minutes between 1 and 1080),
 original_ends_at timestamptz,original_minutes integer not null check(original_minutes>=0),
 reason text not null check(length(reason)<=240),
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','APROBADA','RECHAZADA','SUSTITUIDA','ANULADA')),
 decision_note text not null default '',decided_minutes integer,version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,entry_id) references public.time_entries(company_id,id),foreign key(company_id,worker_id) references public.workers(company_id,id)
);
create unique index time_field_one_declaration on public.time_field_declarations(company_id,entry_id) where status='PENDIENTE';
create table app_private.time_field_values (
 company_id uuid not null,entry_id uuid not null,clock_key text not null,effective_minutes integer check(effective_minutes>=0),
 original_minutes integer not null check(original_minutes>=0),proposed_minutes integer not null check(proposed_minutes between 0 and 1080),
 needs_review boolean not null,last_kind text not null check(last_kind in ('REQUEST','DECLARE')),
 proposal_id uuid,declaration_id uuid,mutation_version integer not null check(mutation_version>0),
 primary key(company_id,entry_id),foreign key(company_id,entry_id) references public.time_entries(company_id,id),
 foreign key(company_id,proposal_id) references public.time_field_proposals(company_id,id),
 foreign key(company_id,declaration_id) references public.time_field_declarations(company_id,id)
);
create table app_private.time_field_requests (
 company_id uuid not null references public.companies(id),actor_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
alter table public.time_field_proposals enable row level security;
alter table public.time_field_declarations enable row level security;
alter table app_private.time_field_values enable row level security;
alter table app_private.time_field_requests enable row level security;
revoke all on public.time_field_proposals,public.time_field_declarations,app_private.time_field_values,app_private.time_field_requests from public,anon,authenticated;
grant select on public.time_field_proposals,public.time_field_declarations to authenticated;
-- Reuse the existing entry RLS. Foremen receive no raw subordinate proposal,
-- reason, GPS or contact access; their review uses the minimal team RPC.
create policy time_field_proposals_read on public.time_field_proposals for select to authenticated using (
 app_private.can_access(company_id,'horasfix','read') and exists(select 1 from public.time_entries e where e.company_id=time_field_proposals.company_id and e.id=time_field_proposals.entry_id and (app_private.is_manager(e.company_id) or e.worker_id=time_field_proposals.worker_id))
);
create policy time_field_declarations_read on public.time_field_declarations for select to authenticated using (
 app_private.can_access(company_id,'horasfix','read') and exists(select 1 from public.time_entries e where e.company_id=time_field_declarations.company_id and e.id=time_field_declarations.entry_id and (app_private.is_manager(e.company_id) or e.worker_id=time_field_declarations.worker_id))
);
create trigger time_field_proposals_audit after insert or update on public.time_field_proposals for each row execute function app_private.audit_change();
create trigger time_field_declarations_audit after insert or update on public.time_field_declarations for each row execute function app_private.audit_change();

create function app_private.field_time_clock_key(p_worker uuid,p_project uuid,p_start timestamptz,p_end timestamptz,p_break integer,p_rule text)
returns text language sql immutable set search_path='' as $$
 -- Project reassignment alone is metadata: it cannot discard effective Field
 -- minutes. A different worker or clock still invalidates the private override.
 select md5(jsonb_build_array(p_worker,extract(epoch from p_start),extract(epoch from p_end),p_break,p_rule)::text);
$$;
create function app_private.field_time_at(p_day date,p_hour text,p_tz text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare parts text[];h integer;m integer;local_at timestamp;candidate timestamptz;earliest timestamptz;
begin
 if nullif(trim(p_hour),'') is null then return null;end if;
 parts:=regexp_match(upper(trim(p_hour)),'^([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)$');
 if parts is not null then h:=parts[1]::integer%12; m:=parts[2]::integer;if parts[3]='PM' then h:=h+12;end if;
 else parts:=regexp_match(trim(p_hour),'^([0-9]{1,2}):([0-9]{2})$');if parts is null then return null;end if;h:=parts[1]::integer;m:=parts[2]::integer;end if;
 if h not between 0 and 23 or m not between 0 and 59 then return null;end if;
 local_at:=p_day::timestamp+make_interval(hours=>h,mins=>m);
 candidate:=local_at at time zone p_tz;
 -- PHP DateTime chooses the first occurrence in a repeated NY wall hour.
 -- PostgreSQL chooses standard time; select the earlier exact wall match.
 select min(x) into earliest from generate_series(candidate-interval '2 hours',candidate,interval '30 minutes') x where x at time zone p_tz=local_at;
 return coalesce(earliest,candidate);
end;$$;
create function app_private.field_time_pending(p_company uuid,p_entry uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.time_field_values v left join public.time_field_proposals p on p.company_id=v.company_id and p.id=v.proposal_id
  where v.company_id=p_company and v.entry_id=p_entry and (v.needs_review or p.status='PENDIENTE'));
$$;
revoke all on function app_private.field_time_clock_key(uuid,uuid,timestamptz,timestamptz,integer,text),app_private.field_time_at(date,text,text),app_private.field_time_pending(uuid,uuid) from public,anon,authenticated;

create function public.submit_field_time(p_company uuid,p_request uuid,p_entry uuid,p_version integer,p_kind text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;e public.time_entries;v app_private.time_field_values;receipt app_private.time_field_requests;
 payload jsonb;result jsonb;tz text;ci timestamptz;co timestamptz;new_in timestamptz;new_out timestamptz;declared_out timestamptz;
 proposed integer;effective integer;original integer;why text;new_id uuid;proposal uuid;declaration uuid;k text;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_entry is null or p_version is null or p_version<1 or p_kind is null or p_kind not in ('REQUEST','DECLARE')
  or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2000
  or exists(select 1 from jsonb_object_keys(p_data) x where x not in ('start_hour','end_hour','reason')) then raise exception 'invalid_field_time';end if;
 why:=trim(coalesce(p_data->>'reason',case when p_kind='DECLARE' then 'Olvidé marcar la salida' else '' end));
 if length(why)>240 or (p_kind='REQUEST' and why='') then raise exception 'field_reason_required';end if;
 payload:=jsonb_build_object('operation','submit','entry',p_entry,'version',p_version,'kind',p_kind,'start_hour',trim(coalesce(p_data->>'start_hour','')),'end_hour',trim(coalesce(p_data->>'end_hour','')),'reason',why);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 perform 1 from public.memberships where company_id=p_company and user_id=auth.uid() for share;
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 actor:=app_private.workforce_actor(p_company);
 if actor.id is null then raise exception 'worker_login_required' using errcode='42501';end if;
 perform 1 from public.workers where company_id=p_company and id=actor.id for share;
 select * into e from public.time_entries where company_id=p_company and id=p_entry and worker_id=actor.id for update;
 if not found or e.status='ANULADO' then raise exception 'entry_unavailable' using errcode='42501';end if;
 select * into receipt from app_private.time_field_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if receipt.payload=payload then return receipt.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if exists(select 1 from public.time_requests where company_id=p_company and entry_id=p_entry and status='PENDIENTE') then raise exception 'administrative_request_pending' using errcode='PT409';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);
 select timezone into tz from public.companies where id=p_company;
 ci:=to_timestamp(floor(extract(epoch from e.starts_at)));co:=case when e.ends_at is not null then to_timestamp(floor(extract(epoch from e.ends_at))) end;
 if p_kind='REQUEST' then
  new_in:=app_private.field_time_at((ci at time zone tz)::date,p_data->>'start_hour',tz);
  new_out:=app_private.field_time_at((ci at time zone tz)::date,p_data->>'end_hour',tz);
  if new_in is null and new_out is null then raise exception 'field_hour_required';end if;
  new_in:=coalesce(new_in,ci);new_out:=coalesce(new_out,co);
  if new_out<new_in then new_out:=new_out+interval '86400 seconds';end if;
  if new_out-new_in>interval '18 hours' then raise exception 'field_shift_too_long';end if;
  proposed:=case when new_out is null then 0 else greatest(0,round(extract(epoch from new_out-new_in)/60)::integer) end;
 else
  if coalesce(trim(p_data->>'end_hour'),'')!~'^([0-9]{1,2}):([0-9]{2})$' then raise exception 'invalid_field_hour';end if;
  new_in:=ci;new_out:=app_private.field_time_at((ci at time zone tz)::date,p_data->>'end_hour',tz);
  if new_out<=ci then new_out:=new_out+interval '86400 seconds';end if;
  if new_out is null or new_out<=ci or new_out-ci>interval '18 hours' then raise exception 'invalid_field_hour';end if;
  proposed:=greatest(1,round(extract(epoch from new_out-ci)/60)::integer);
  if exists(select 1 from public.time_entries t where t.company_id=p_company and t.worker_id=e.worker_id and t.id<>e.id and t.status<>'ANULADO' and t.starts_at<new_out and coalesce(t.ends_at,'infinity')>e.starts_at) then raise exception 'time_overlap';end if;
 end if;
 perform app_private.assert_time_open(p_company,new_in,new_out);
 select * into v from app_private.time_field_values where company_id=p_company and entry_id=p_entry for update;
 -- REQUEST snapshots its own paid amount, but only DECLARE initializes the
 -- first positive original amount retained by the source's declaration flow.
 original:=case when p_kind='REQUEST' then coalesce(v.original_minutes,0) when v.original_minutes>0 then v.original_minutes else coalesce(e.minutes,0) end;
 effective:=case when p_kind='DECLARE' then coalesce(e.minutes,0) else e.minutes end;
 new_id:=gen_random_uuid();proposal:=v.proposal_id;declaration:=v.declaration_id;
 if p_kind='REQUEST' then
  update public.time_field_proposals set status='SUSTITUIDA',version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and entry_id=p_entry and status='PENDIENTE';
  insert into public.time_field_proposals(id,company_id,entry_id,worker_id,starts_at,ends_at,proposed_minutes,original_starts_at,original_ends_at,original_minutes,reason,created_by,updated_by)
   values(new_id,p_company,p_entry,e.worker_id,new_in,new_out,proposed,e.starts_at,e.ends_at,coalesce(e.minutes,0),why,auth.uid(),auth.uid());proposal:=new_id;
 else
  update public.time_field_declarations set status='SUSTITUIDA',version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and entry_id=p_entry and status='PENDIENTE';
  insert into public.time_field_declarations(id,company_id,entry_id,worker_id,ends_at,proposed_minutes,original_ends_at,original_minutes,reason,created_by,updated_by)
   values(new_id,p_company,p_entry,e.worker_id,new_out,proposed,e.ends_at,original,why,auth.uid(),auth.uid());declaration:=new_id;
 end if;
 declared_out:=case when p_kind='DECLARE' then new_out else e.ends_at end;
 k:=app_private.field_time_clock_key(e.worker_id,e.project_id,e.starts_at,declared_out,e.break_minutes,e.minute_rule);
 insert into app_private.time_field_values(company_id,entry_id,clock_key,effective_minutes,original_minutes,proposed_minutes,needs_review,last_kind,proposal_id,declaration_id,mutation_version)
 values(p_company,p_entry,k,effective,original,proposed,true,p_kind,proposal,declaration,e.version+1)
 on conflict(company_id,entry_id) do update set clock_key=excluded.clock_key,effective_minutes=excluded.effective_minutes,original_minutes=excluded.original_minutes,proposed_minutes=excluded.proposed_minutes,needs_review=true,last_kind=excluded.last_kind,proposal_id=excluded.proposal_id,declaration_id=excluded.declaration_id,mutation_version=excluded.mutation_version;
 update public.time_entries set ends_at=declared_out,status='PENDIENTE',version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and id=p_entry returning * into e;
 result:=jsonb_build_object('entry',e.id,'version',e.version,'record',new_id,'kind',p_kind,'proposed_minutes',proposed,'minutes',e.minutes,'status',e.status);
 insert into app_private.time_field_requests(company_id,actor_id,request_id,payload,result) values(p_company,auth.uid(),p_request,payload,result);
 return result;
end;$$;

create function public.review_field_time(p_company uuid,p_request uuid,p_entry uuid,p_version integer,p_approve boolean,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.workforce_profiles;e public.time_entries;v app_private.time_field_values;p public.time_field_proposals;
 receipt app_private.time_field_requests;payload jsonb;result jsonb;manager boolean;new_start timestamptz;new_end timestamptz;new_rule text;paid integer;k text;st text;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_entry is null or p_version is null or p_version<1 or p_approve is null or p_note is null or length(trim(p_note))>240 then raise exception 'invalid_field_review';end if;
 payload:=jsonb_build_object('operation','review','entry',p_entry,'version',p_version,'approve',p_approve,'note',trim(p_note));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 perform 1 from public.memberships where company_id=p_company and user_id=auth.uid() for share;
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 manager:=app_private.is_manager(p_company);actor:=app_private.workforce_actor(p_company);
 if not manager and (actor.id is null or actor.role<>'FOREMAN') then raise exception 'foreman_required' using errcode='42501';end if;
 if not manager and not p_approve then raise exception 'manager_required' using errcode='42501';end if;
 select * into e from public.time_entries where company_id=p_company and id=p_entry for update;
 if not found or e.status='ANULADO' then raise exception 'entry_unavailable' using errcode='42501';end if;
 perform 1 from public.workers where company_id=p_company and id in (e.worker_id,actor.id) order by id for share;
 if not app_private.can_review_workforce_time(p_company,e.worker_id) then raise exception 'entry_unavailable' using errcode='42501';end if;
 select * into receipt from app_private.time_field_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then if receipt.payload=payload then return receipt.result;end if;raise exception 'request_conflict' using errcode='PT409';end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 select * into v from app_private.time_field_values where company_id=p_company and entry_id=p_entry for update;
 if not found then raise exception 'field_review_unavailable' using errcode='PT409';end if;
 select * into p from public.time_field_proposals where company_id=p_company and id=v.proposal_id for update;
 if not v.needs_review and (not manager or p.status is distinct from 'PENDIENTE') then raise exception 'field_review_unavailable' using errcode='PT409';end if;
 if exists(select 1 from public.time_requests where company_id=p_company and entry_id=p_entry and status='PENDIENTE') then raise exception 'administrative_request_pending' using errcode='PT409';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);
 new_start:=e.starts_at;new_end:=e.ends_at;new_rule:=e.minute_rule;
 if p_approve then
  if not manager then
   if e.ends_at is null then raise exception 'shift_open' using errcode='PT409';end if;
   paid:=case when v.proposed_minutes>0 then v.proposed_minutes else coalesce(e.minutes,0) end;
  else
   if p.status='PENDIENTE' then new_start:=p.starts_at;new_end:=coalesce(p.ends_at,e.ends_at);end if;
   -- Retain the existing SaaS positive interval constraint. Equal-hour
   -- requests can be stored, but cannot become an invalid canonical interval.
   if new_end is null or new_end<=new_start then raise exception 'field_positive_interval_required' using errcode='PT409';end if;
   if new_end-new_start>interval '18 hours' then raise exception 'field_shift_too_long';end if;
   if e.break_minutes>floor(extract(epoch from new_end-new_start)/60) then raise exception 'field_break_conflict' using errcode='PT409';end if;
   if e.minute_rule='CAMPO_CLOCK_V1' and (new_start,new_end,e.break_minutes) is distinct from (e.starts_at,e.ends_at,e.break_minutes) then new_rule:='LEGACY_FLOOR_V1';end if;
   paid:=greatest(0,round((floor(extract(epoch from new_end))-floor(extract(epoch from new_start)))/60)::integer);
   if exists(select 1 from public.time_entries t where t.company_id=p_company and t.worker_id=e.worker_id and t.id<>e.id and t.status<>'ANULADO' and t.starts_at<new_end and coalesce(t.ends_at,'infinity')>new_start) then raise exception 'time_overlap';end if;
  end if;
 else
  if trim(p_note)='' then raise exception 'field_rejection_reason_required';end if;
  paid:=e.minutes;
 end if;
 perform app_private.assert_time_open(p_company,new_start,new_end);
 st:=case when new_end is null then 'PENDIENTE' else 'APROBADO' end;
 k:=app_private.field_time_clock_key(e.worker_id,e.project_id,new_start,new_end,e.break_minutes,new_rule);
 update app_private.time_field_values set clock_key=k,effective_minutes=paid,needs_review=false,
  proposed_minutes=case when p_approve then proposed_minutes else 0 end,mutation_version=e.version+1 where company_id=p_company and entry_id=p_entry;
 if p.status='PENDIENTE' then
  if manager then
   update public.time_field_proposals set status=case when p_approve then 'APROBADA' else 'RECHAZADA' end,decision_note=trim(p_note),decided_minutes=paid,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and id=p.id;
  else
   -- Campo Encargado approves minutes only; the formal request remains for
   -- Administration to apply its requested endpoints or reject it.
   update public.time_field_proposals set foreman_minutes=paid,foreman_by=auth.uid(),foreman_at=clock_timestamp(),version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and id=p.id;
  end if;
 end if;
 update public.time_field_declarations set status=case when p_approve then 'APROBADA' else 'RECHAZADA' end,decision_note=trim(p_note),decided_minutes=paid,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and id=v.declaration_id and status='PENDIENTE';
 update public.time_entries set starts_at=new_start,ends_at=new_end,minute_rule=new_rule,status=st,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where company_id=p_company and id=p_entry returning * into e;
 result:=jsonb_build_object('entry',e.id,'version',e.version,'minutes',e.minutes,'status',e.status,'approved',p_approve,'formal_pending',not manager and coalesce(p.status='PENDIENTE',false));
 insert into app_private.time_field_requests(company_id,actor_id,request_id,payload,result) values(p_company,auth.uid(),p_request,payload,result);
 return result;
end;$$;
revoke all on function public.submit_field_time(uuid,uuid,uuid,integer,text,jsonb),public.review_field_time(uuid,uuid,uuid,integer,boolean,text) from public,anon;
grant execute on function public.submit_field_time(uuid,uuid,uuid,integer,text,jsonb),public.review_field_time(uuid,uuid,uuid,integer,boolean,text) to authenticated;

create function public.field_time_status(p_company uuid,p_entry uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.time_entries;v app_private.time_field_values;p public.time_field_proposals;actor public.workforce_profiles;locked boolean;
begin
 if not app_private.can_access(p_company,'horasfix','read') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.time_entries where company_id=p_company and id=p_entry;
 if not found or not app_private.can_read_time_worker(p_company,e.worker_id) then raise exception 'entry_unavailable' using errcode='42501';end if;
 select * into v from app_private.time_field_values where company_id=p_company and entry_id=p_entry;
 select * into p from public.time_field_proposals where company_id=p_company and id=v.proposal_id and worker_id=e.worker_id;
 actor:=app_private.workforce_actor(p_company);
 select exists(select 1 from public.time_periods t join public.companies c on c.id=t.company_id where t.company_id=p_company and t.locked
  and e.starts_at<((t.week_start+7)::timestamp at time zone c.timezone) and coalesce(e.ends_at,e.starts_at+interval '1 microsecond')>(t.week_start::timestamp at time zone c.timezone)) into locked;
 return jsonb_build_object('entry',e.id,'version',e.version,'minutes',e.minutes,'proposed_minutes',v.proposed_minutes,'kind',v.last_kind,
 'needs_review',coalesce(v.needs_review,false),'formal_pending',coalesce(p.status='PENDIENTE',false),'locked',locked,
 'can_submit',coalesce(actor.id=e.worker_id,false) and app_private.can_access(p_company,'horasfix','write') and e.status<>'ANULADO' and not locked
  and not exists(select 1 from public.time_requests where company_id=p_company and entry_id=p_entry and status='PENDIENTE'));
end;$$;
revoke all on function public.field_time_status(uuid,uuid) from public,anon;
grant execute on function public.field_time_status(uuid,uuid) to authenticated;

-- Existing function extensions follow. Original policies and rows are intact.
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'pricing_settings' then 'adm-precios' when 'labor_rates' then 'gastos' when 'labor_project_terms' then 'gastos' when 'labor_settings' then 'gastos' when 'labor_expense_links' then 'gastos' when 'workforce_expenses' then 'horasfix' when 'workforce_profiles' then 'trabajadores' when 'workforce_assignments' then 'trabajadores' when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_field_proposals' then 'horasfix' when 'time_field_declarations' then 'horasfix' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;

create or replace function app_private.can_read_time_audit(p_company uuid,p_entity text,p_before jsonb,p_after jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_entity in ('time_field_proposals','time_field_declarations') then
 app_private.is_manager(p_company) or exists(select 1 from public.time_entries e where e.company_id=p_company
 and e.id=(coalesce(p_after,p_before)->>'entry_id')::uuid and e.worker_id=(coalesce(p_after,p_before)->>'worker_id')::uuid
 and app_private.can_read_time_worker(p_company,e.worker_id)) when p_entity in ('labor_rates','labor_project_terms','labor_settings','labor_expense_links') then app_private.can_read_labor(p_company) when p_entity='workforce_expenses' then app_private.can_read_workforce_expense_record(p_company,(coalesce(p_after,p_before)->>'id')::uuid) when p_entity in ('workforce_profiles','workforce_assignments') then app_private.is_manager(p_company) when p_entity not in ('time_entries','time_requests','time_periods') then true
 when app_private.is_manager(p_company) then true
 else app_private.can_read_time_record(p_company,p_entity,(coalesce(p_after,p_before)->>'id')::uuid)
 and (p_entity<>'time_entries' or (
  (p_before is null or app_private.can_read_time_worker(p_company,(p_before->>'worker_id')::uuid))
  and (p_after is null or app_private.can_read_time_worker(p_company,(p_after->>'worker_id')::uuid))
 )) end;
$$;

create or replace function app_private.compute_time_minutes() returns trigger
language plpgsql set search_path='' as $$
declare field app_private.time_field_values;matches_field boolean;
begin
 if tg_op='UPDATE' then
  select * into field from app_private.time_field_values where company_id=new.company_id and entry_id=new.id;
  matches_field:=field.clock_key=app_private.field_time_clock_key(new.worker_id,new.project_id,new.starts_at,new.ends_at,new.break_minutes,new.minute_rule);
  if new.status='ANULADO' or new.worker_id is distinct from old.worker_id then
   update public.time_field_proposals set status='ANULADA',version=version+1,updated_by=new.updated_by,updated_at=new.updated_at where company_id=new.company_id and entry_id=new.id and status='PENDIENTE';
   update public.time_field_declarations set status='ANULADA',version=version+1,updated_by=new.updated_by,updated_at=new.updated_at where company_id=new.company_id and entry_id=new.id and status='PENDIENTE';
   update app_private.time_field_values set needs_review=false,proposed_minutes=0 where company_id=new.company_id and entry_id=new.id;
  end if;
  -- Only the private RPC state can pin effective minutes to this exact clock.
  -- A forged minutes value or session setting cannot select a paid override.
  if matches_field and (new.minute_rule is not distinct from old.minute_rule or field.mutation_version=new.version) then
   new.minutes:=field.effective_minutes;return new;
  end if;
  if new.minute_rule is distinct from old.minute_rule then raise exception 'clock_minute_rule_locked';end if;
  -- Existing manual correction semantics remain independent of clock-out.
  -- A note, project, status change or retry alone does not discard clock rounding.
  if old.minute_rule='CAMPO_CLOCK_V1' and (
   (old.ends_at is not null and (new.starts_at,new.ends_at,new.break_minutes) is distinct from (old.starts_at,old.ends_at,old.break_minutes))
   or (old.ends_at is null and new.ends_at is not null and new.gps_out is null)
  ) then new.minute_rule:='LEGACY_FLOOR_V1';end if;
 end if;
 new.minutes:=app_private.time_entry_minutes(new.starts_at,new.ends_at,new.break_minutes,new.minute_rule);
 return new;
end;$$;

create or replace function public.workforce_time_review(
 p_company uuid,p_from date,p_to date,p_worker uuid default null,p_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.workforce_profiles;manager boolean;tz text;first_at timestamptz;last_at timestamptz;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','read') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 manager:=app_private.is_manager(p_company);
 actor:=app_private.workforce_actor(p_company);
 if not manager and (actor.id is null or actor.role<>'FOREMAN') then
  raise exception 'foreman_required' using errcode='42501';
 end if;
 select timezone into tz from public.companies where id=p_company;
 if tz is null or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_to<p_from or p_page is null or p_page<1 or p_page>100000 then
  raise exception 'invalid_time_range' using errcode='22023';
 end if;
 first_at:=p_from::timestamp at time zone tz;
 last_at:=(p_to::timestamp+interval '23 hours 59 minutes 59 seconds') at time zone tz;
 if floor(extract(epoch from last_at-first_at)/86400)+1>62 then
  raise exception 'time_range_too_long' using errcode='22023';
 end if;
 with visible as materialized (
  select e.id,e.version,e.worker_id,w.name as worker_name,coalesce(p.name,'Sin obra') as project_name,
   to_char(e.starts_at at time zone tz,'YYYY-MM-DD HH24:MI') as starts_local,
   case when e.ends_at is not null then to_char(e.ends_at at time zone tz,'YYYY-MM-DD HH24:MI') end as ends_local,
   e.minutes,e.status,e.ends_at is null as open,
   v.proposed_minutes as field_minutes,v.last_kind as field_kind,coalesce(v.needs_review,false) as field_needs_review,
   coalesce(fp.status='PENDIENTE',false) as formal_pending,
   case when manager and fp.status='PENDIENTE' then to_char(fp.starts_at at time zone tz,'YYYY-MM-DD HH24:MI') end as field_in_local,
   case when manager and fp.status='PENDIENTE' and fp.ends_at is not null then to_char(fp.ends_at at time zone tz,'YYYY-MM-DD HH24:MI') end as field_out_local,
   exists(select 1 from public.time_requests r where r.company_id=e.company_id and r.entry_id=e.id and r.status='PENDIENTE') as administrative_pending,
   exists(select 1 from public.time_periods t where t.company_id=e.company_id and t.locked
    and e.starts_at<((t.week_start+7)::timestamp at time zone tz)
    and coalesce(e.ends_at,e.starts_at+interval '1 microsecond')>(t.week_start::timestamp at time zone tz)) as locked,
   exists(select 1 from public.time_requests r where r.company_id=e.company_id and r.entry_id=e.id and r.status='PENDIENTE') or app_private.field_time_pending(e.company_id,e.id) as correction_pending
  from public.time_entries e join public.workers w on w.company_id=e.company_id and w.id=e.worker_id
  left join public.projects p on p.company_id=e.company_id and p.id=e.project_id
  left join app_private.time_field_values v on v.company_id=e.company_id and v.entry_id=e.id
  left join public.time_field_proposals fp on fp.company_id=v.company_id and fp.id=v.proposal_id
  where e.company_id=p_company and e.status<>'ANULADO'
   and app_private.can_review_workforce_time(p_company,e.worker_id)
   and e.starts_at>=first_at and e.starts_at<((p_to+1)::timestamp at time zone tz)
   and (p_worker is null or e.worker_id=p_worker)
 ), pagination as (
  select count(*)::integer as count,least(p_page,greatest(1,ceil(count(*)/20.0)::integer)) as page from visible
 ), page_rows as (
  select * from visible order by starts_local,worker_name,id limit 20 offset ((select page from pagination)-1)*20
 )
 select jsonb_build_object(
  'company',p_company,'from',p_from,'to',p_to,'timezone',tz,
  'role',case when manager then 'ADMIN' else 'FOREMAN' end,
  'count',(select count from pagination),'page',(select page from pagination),
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
   'id',r.id,'version',r.version,'worker_id',r.worker_id,'worker_name',r.worker_name,
   'project_name',r.project_name,'starts_local',r.starts_local,'ends_local',r.ends_local,
   'minutes',r.minutes,'status',r.status,'open',r.open,'locked',r.locked,'correction_pending',r.correction_pending,
   'field_minutes',field_minutes,'field_kind',field_kind,'field_needs_review',field_needs_review,'formal_pending',formal_pending,
    'field_in_local',field_in_local,'field_out_local',field_out_local,
    'can_approve_field',app_private.can_access(p_company,'horasfix','write') and not locked and not administrative_pending
      and ((manager and (field_needs_review or formal_pending)) or (not manager and field_needs_review and not open)),
    'can_reject_field',manager and app_private.can_access(p_company,'horasfix','write') and not locked and not administrative_pending and (field_needs_review or formal_pending),
    'can_approve',not r.open and not r.locked and not r.correction_pending and r.status='PENDIENTE'
    and app_private.can_access(p_company,'horasfix','write')
  ) order by r.starts_local,r.worker_name,r.id) from page_rows r),'[]'::jsonb)
 ) into result;
 return result;
end;$$;

create or replace function public.approve_workforce_time(p_company uuid,p_request uuid,p_entry uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.time_entries;actor public.workforce_profiles;receipt app_private.workforce_time_approvals;payload jsonb;result jsonb;
begin
 if not app_private.can_access(p_company,'horasfix','write') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 if p_request is null or p_entry is null or p_version is null or p_version<1 then
  raise exception 'invalid_time_approval' using errcode='22023';
 end if;
 -- Serialize with both hierarchy changes and the existing hours commands.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':workforce-admin',0));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 if not app_private.can_access(p_company,'horasfix','write') then
  raise exception 'permission_denied' using errcode='42501';
 end if;
 actor:=app_private.workforce_actor(p_company);
 if not app_private.is_manager(p_company) and (actor.id is null or actor.role<>'FOREMAN') then
  raise exception 'foreman_required' using errcode='42501';
 end if;
 select * into e from public.time_entries where company_id=p_company and id=p_entry for update;
 if not found then raise exception 'entry_unavailable' using errcode='42501';end if;
 -- Lock identity/active state as well; neither a reassignment nor a disabled
 -- profile may be bypassed through a previously successful request receipt.
 perform 1 from public.workers where company_id=p_company and id in (e.worker_id,actor.id) order by id for share;
 if not app_private.can_review_workforce_time(p_company,e.worker_id) then
  raise exception 'entry_unavailable' using errcode='42501';
 end if;
 payload:=jsonb_build_object('entry',p_entry,'version',p_version);
 select * into receipt from app_private.workforce_time_approvals
  where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then
  if receipt.payload=payload then return receipt.result;end if;
  raise exception 'request_conflict' using errcode='PT409';
 end if;
 if e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if app_private.field_time_pending(p_company,p_entry) then raise exception 'field_review_pending' using errcode='PT409';end if;
 if e.status='ANULADO' then raise exception 'entry_unavailable' using errcode='PT409';end if;
 if e.ends_at is null then raise exception 'shift_open' using errcode='PT409';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);
 if exists(select 1 from public.time_requests where company_id=p_company and entry_id=e.id and status='PENDIENTE') then
  raise exception 'correction_pending' using errcode='PT409';
 end if;
 if e.status='APROBADO' then raise exception 'shift_already_approved' using errcode='PT409';end if;
 update public.time_entries set status='APROBADO',version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
  where company_id=p_company and id=e.id returning * into e;
 -- Audit trigger records the actor and before/after state. Preserve reason,
 -- notes, clock endpoints, minute rule, GPS, worker, project and paid minutes.
 result:=jsonb_build_object('entry',e.id,'version',e.version,'minutes',e.minutes,'status',e.status);
 insert into app_private.workforce_time_approvals(company_id,actor_id,request_id,payload,result)
  values(p_company,auth.uid(),p_request,payload,result);
 return result;
end;$$;

CREATE OR REPLACE FUNCTION public.request_time_change(p_company uuid, p_id uuid, p_entry uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.time_entries;ts timestamptz;te timestamptz;br integer;why text;existing public.time_requests;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into e from public.time_entries where company_id=p_company and id=p_entry for update;
 if not found or (not app_private.is_manager(p_company) and not exists(select 1 from public.workers where company_id=p_company and id=e.worker_id and user_id=auth.uid() and active)) then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_data is null or octet_length(p_data::text)>5000 then raise exception 'invalid_request';end if;
 ts:=(p_data->>'starts_at')::timestamptz;te:=(p_data->>'ends_at')::timestamptz;br:=(p_data->>'break_minutes')::integer;why:=trim(p_data->>'reason');
 select * into existing from public.time_requests where company_id=p_company and id=p_id;
 if found then if (existing.entry_id,existing.starts_at,existing.ends_at,existing.break_minutes,existing.reason,existing.created_by) is not distinct from (p_entry,ts,te,br,why,auth.uid()) then return p_id;end if;raise exception 'request_conflict';end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if app_private.field_time_pending(p_company,p_entry) then raise exception 'field_review_pending' using errcode='PT409';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);perform app_private.assert_time_open(p_company,ts,te);
 if e.status='ANULADO' or ts is null or te is null or br is null or why is null then raise exception 'invalid_request';end if;
 insert into public.time_requests(id,company_id,entry_id,entry_version,starts_at,ends_at,break_minutes,reason,created_by,updated_by) values(p_id,p_company,p_entry,p_version,ts,te,br,why,auth.uid(),auth.uid());
 return p_id;
end;$function$;

create or replace function public.set_time_period(p_company uuid,p_week date,p_locked boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare tz text;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_week is null or extract(isodow from p_week)<>1 or p_locked is null or p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'invalid_period';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select timezone into tz from public.companies where id=p_company;
 if p_locked and (exists(select 1 from public.time_entries e where e.company_id=p_company and e.status<>'ANULADO'
  and app_private.field_time_pending(p_company,e.id) and e.starts_at<((p_week+7)::timestamp at time zone tz) and coalesce(e.ends_at,'infinity')>(p_week::timestamp at time zone tz)) or exists(select 1 from public.time_entries where company_id=p_company and status<>'ANULADO' and starts_at<((p_week+7)::timestamp at time zone tz) and coalesce(ends_at,'infinity')>(p_week::timestamp at time zone tz) and (ends_at is null or status<>'APROBADO')) or exists(select 1 from public.time_requests r join public.time_entries e on e.id=r.entry_id where r.company_id=p_company and r.status='PENDIENTE' and e.starts_at<((p_week+7)::timestamp at time zone tz) and coalesce(e.ends_at,'infinity')>(p_week::timestamp at time zone tz))) then raise exception 'unreviewed_period';end if;
 insert into public.time_periods(id,company_id,week_start,locked,reason,created_by,updated_by) values(gen_random_uuid(),p_company,p_week,p_locked,trim(p_reason),auth.uid(),auth.uid()) on conflict(company_id,week_start) do update set locked=excluded.locked,reason=excluded.reason,version=time_periods.version+1,updated_by=auth.uid(),updated_at=now();
end;$$;
create or replace function public.labor_context(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not app_private.can_read_labor(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 if (select count(*) from public.time_entries where company_id=p_company)>20000 then raise exception 'labor_pagination_required';end if;
 select jsonb_build_object('company',p_company,'timezone',c.timezone,
 'splitRule',coalesce((select shared_day_rule from public.labor_settings where company_id=p_company),'review'),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('external_id',t.id,'worker_id',t.worker_id,'project_external_id',coalesce(t.project_id::text,''),'clock_in',floor(extract(epoch from t.starts_at))::bigint,'clock_out',floor(extract(epoch from t.ends_at))::bigint,'minutes',t.minutes,
 'minutes_authoritative',exists(select 1 from app_private.time_field_values v where v.company_id=t.company_id and v.entry_id=t.id and v.clock_key=app_private.field_time_clock_key(t.worker_id,t.project_id,t.starts_at,t.ends_at,t.break_minutes,t.minute_rule)),
 'status',case when t.ends_at is null then 'open' else 'closed' end,
 'review_status',case when t.status<>'APROBADO' or exists(select 1 from app_private.time_field_values v where v.company_id=t.company_id and v.entry_id=t.id and v.needs_review) or not exists(select 1 from public.workforce_assignments a where a.company_id=t.company_id and a.worker_id=t.worker_id and a.project_id=t.project_id and (a.active or a.ends_at is not null) and a.starts_at<=t.starts_at and (a.ends_at is null or a.ends_at>=t.ends_at)) then 'NEEDS_REVIEW' else 'OK' end,
 'req_status',case when exists(select 1 from public.time_requests r where r.company_id=t.company_id and r.entry_id=t.id and r.status='PENDIENTE') or exists(select 1 from public.time_field_proposals f where f.company_id=t.company_id and f.entry_id=t.id and f.worker_id=t.worker_id and f.status='PENDIENTE') then 'PENDING' else '' end) order by t.starts_at,t.id) from public.time_entries t where t.company_id=p_company and t.status<>'ANULADO'),'[]'),
 'rates',coalesce((select jsonb_object_agg(worker_id,rates) from (select worker_id,jsonb_agg(jsonb_build_object('from',starts_on,'to',ends_on,'cents',(amount*100)::bigint) order by starts_on,id) rates from public.labor_rates where company_id=p_company and active group by worker_id) r),'{}'),
 'projects',coalesce((select jsonb_object_agg(id,jsonb_build_object('mode',mode)) from public.labor_project_terms where company_id=p_company and active),'{}'),
 'adjustments',coalesce((select jsonb_object_agg(id,jsonb_build_object('id',id,'workerId',responsible_id,'amountCents',(amount*100)::bigint,'estimateId',estimate_id,'revision',estimate_version::text)) from public.labor_project_terms where company_id=p_company and active and mode='adjustment'),'{}'),
 'historical',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text||':'||(a.value->>'worker')||':'||(a.value->>'date'),'workerId',a.value->>'worker','projectId',e.project_id,'date',a.value->>'date','amountCents',(a.value->>'cents')::bigint) order by e.id,a.value->>'worker',a.value->>'date') from public.expenses e join public.labor_expense_links l on l.company_id=e.company_id and l.id=e.id and l.active cross join lateral jsonb_array_elements(l.allocations) a where e.company_id=p_company and e.status<>'ANULADO' and l.source_snapshot=app_private.labor_expense_snapshot(e)),'[]'),
 'unmapped',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'projectId',e.project_id,'date',e.expense_date,'amountCents',(e.amount*100)::bigint,'reason','EXISTING_LABOR_RECONCILIATION_REQUIRED') order by e.expense_date,e.id) from public.expenses e where e.company_id=p_company and e.status<>'ANULADO' and (e.category~*'mano.*obra|labor|subcontr|n[oó]mina' or exists(select 1 from public.labor_expense_links x where x.company_id=e.company_id and x.id=e.id and x.active)) and not exists(select 1 from public.labor_expense_links l where l.company_id=e.company_id and l.id=e.id and l.active and l.source_snapshot=app_private.labor_expense_snapshot(e))),'[]'),
 'names',jsonb_build_object('workers',coalesce((select jsonb_object_agg(id,name) from public.workers where company_id=p_company),'{}'),'projects',coalesce((select jsonb_object_agg(id,name) from public.projects where company_id=p_company),'{}')),
 'adjustmentDates',coalesce((select jsonb_object_agg(id,cost_date) from public.labor_project_terms where company_id=p_company and active and mode='adjustment'),'{}')) into result from public.companies c where c.id=p_company;
 return result;
end;$$;

notify pgrst,'reload schema';
commit;
