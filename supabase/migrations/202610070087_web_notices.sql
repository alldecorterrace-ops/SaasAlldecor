begin;
create table public.web_notice_settings(id uuid not null unique default gen_random_uuid(),company_id uuid primary key references public.companies(id),staff_email text not null check(length(staff_email) between 3 and 254 and staff_email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$' and left(staff_email,1)<>'-'),version integer not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now());
create table public.web_notice_events(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),request_id uuid not null references public.web_requests(id),kind text not null check(kind in ('customer','staff')),recipient text,snapshot jsonb not null,status text not null default 'pending' check(status in ('blocked','pending','processing','captured','queued','failed','unknown')),mode text check(mode in ('capture','send')),requested_by uuid references auth.users(id),created_at timestamptz not null default now(),finished_at timestamptz,mime_sha256 text check(mime_sha256 ~ '^[a-f0-9]{64}$'),mime_bytes integer check(mime_bytes between 1 and 1000000),unique(request_id,kind),check((mime_sha256 is null)=(mime_bytes is null)),check(status<>'captured' or(mode='capture' and mime_sha256 is not null)),check(status<>'queued' or mode='send'),check(status='blocked' or recipient is not null));
create index web_notice_pending on public.web_notice_events(company_id,status,created_at,id);
alter table public.web_notice_settings enable row level security;alter table public.web_notice_events enable row level security;
revoke all on public.web_notice_settings,public.web_notice_events from public,anon,authenticated;
grant select on public.web_notice_settings,public.web_notice_events to authenticated;
grant select on public.web_notice_events to service_role;
create policy web_notice_settings_read on public.web_notice_settings for select to authenticated using(exists(select 1 from public.memberships m where m.company_id=web_notice_settings.company_id and m.user_id=auth.uid() and m.active and m.role in ('owner','admin')));
create policy web_notice_events_read on public.web_notice_events for select to authenticated using(app_private.can_access(company_id,'estimadosweb','read'));
create trigger web_notice_settings_audit after insert or update on public.web_notice_settings for each row execute function app_private.audit_change();
create trigger web_notice_events_audit after insert or update on public.web_notice_events for each row execute function app_private.audit_change();
create function public.save_web_notice_settings(p_company uuid,p_version integer,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare oldrow public.web_notice_settings;
begin
 if not exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and m.role in ('owner','admin')) or not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_version is null or p_version<0 or p_email is null or trim(p_email)!~'^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$' or length(trim(p_email))>254 or left(trim(p_email),1)='-' then raise exception 'invalid_recipient';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':web-notice-settings',0));
 if not exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and m.role in ('owner','admin')) or not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into oldrow from public.web_notice_settings where company_id=p_company for update;
 if found then if oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 update public.web_notice_settings set staff_email=trim(p_email),version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company;
 else if p_version<>0 then raise exception 'record_conflict' using errcode='PT409';end if;
 insert into public.web_notice_settings(company_id,staff_email,updated_by) values(p_company,trim(p_email),auth.uid());end if;
end;$$;
create function app_private.queue_web_notices() returns trigger language plpgsql security definer set search_path='' as $$
declare company_name text;staff text;snap jsonb;
begin
 select name into company_name from public.companies where id=new.company_id;
 select staff_email into staff from public.web_notice_settings where company_id=new.company_id;
 snap:=jsonb_build_object('company',jsonb_build_object('id',new.company_id,'name',company_name),'request',jsonb_build_object('id',new.id,'created_at',new.created_at,'data',new.data));
 insert into public.web_notice_events(company_id,request_id,kind,recipient,snapshot,status) values(new.company_id,new.id,'customer',new.data->>'email',snap,'pending'),(new.company_id,new.id,'staff',staff,snap,case when staff is null then 'blocked' else 'pending' end);
 return new;
end;$$;
create trigger web_request_notice_queue after insert on public.web_requests for each row execute function app_private.queue_web_notices();
create function public.claim_web_notice(p_company uuid,p_event uuid,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.web_notice_events;worker boolean:=coalesce(auth.role()='service_role',false);
begin
 if not worker and not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_mode is null or p_mode not in ('capture','send') or (worker and p_mode<>'send') then raise exception 'invalid_notice_mode';end if;
 select * into e from public.web_notice_events where company_id=p_company and id=p_event for update;
 if not found then raise exception 'notice_unavailable';end if;
 if not worker and not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if e.status='blocked' then return jsonb_build_object('claimed',false,'event',to_jsonb(e));end if;
 if e.mode is not null and e.mode<>p_mode then raise exception 'notice_mode_conflict';end if;
 if p_mode='capture' and lower(e.recipient)!~'@saasalldecor[.]invalid$' then raise exception 'synthetic_recipient_required';end if;
 if e.status<>'pending' then return jsonb_build_object('claimed',false,'event',to_jsonb(e));end if;
 if not exists(select 1 from public.web_requests r where r.id=e.request_id and r.company_id=p_company) then raise exception 'request_unavailable';end if;
 update public.web_notice_events set status='processing',mode=p_mode,requested_by=auth.uid() where id=e.id returning * into e;
 return jsonb_build_object('claimed',true,'event',to_jsonb(e));
end;$$;
create function public.finish_web_notice(p_company uuid,p_event uuid,p_status text,p_sha256 text default null,p_bytes integer default null) returns public.web_notice_events language plpgsql security definer set search_path='' as $$
declare e public.web_notice_events;worker boolean:=coalesce(auth.role()='service_role',false);
begin
 if not worker and not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.web_notice_events where company_id=p_company and id=p_event for update;
 if not found or (not worker and e.requested_by is distinct from auth.uid()) or (worker and e.mode<>'send') then raise exception 'notice_unavailable';end if;
 if not worker and not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_status is null or p_status not in ('captured','queued','failed','unknown') or (p_status='captured' and e.mode<>'capture') or (p_status='queued' and e.mode<>'send') or ((p_sha256 is null)<>(p_bytes is null)) or (p_sha256 is not null and (p_sha256!~'^[a-f0-9]{64}$' or p_bytes not between 1 and 1000000)) or (p_status='captured' and p_sha256 is null) then raise exception 'invalid_notice_outcome';end if;
 if e.status<>'processing' then if e.status<>p_status or e.mime_sha256 is distinct from p_sha256 or e.mime_bytes is distinct from p_bytes then raise exception 'immutable_notice_outcome';end if;return e;end if;
 if p_status='captured' and not exists(select 1 from storage.objects where bucket_id='web-notice-captures' and name=p_company::text||'/'||e.id::text||'.eml') then raise exception 'missing_notice_file';end if;
 update public.web_notice_events set status=p_status,mime_sha256=p_sha256,mime_bytes=p_bytes,finished_at=now() where id=e.id returning * into e;
 return e;
end;$$;
create function app_private.web_notice_file_access(p_name text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.web_notice_events e where p_name=e.company_id::text||'/'||e.id::text||'.eml' and e.mode='capture' and ((p_action='read' and e.status='captured' and app_private.can_access(e.company_id,'estimadosweb','read')) or(p_action='write' and e.status='processing' and e.requested_by=auth.uid() and app_private.can_access(e.company_id,'estimadosweb','write'))));
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('web-notice-captures','web-notice-captures',false,1000000,array['message/rfc822']);
create policy web_notice_file_read on storage.objects for select to authenticated using(bucket_id='web-notice-captures' and app_private.web_notice_file_access(name,'read'));
create policy web_notice_file_insert on storage.objects for insert to authenticated with check(bucket_id='web-notice-captures' and app_private.web_notice_file_access(name,'write'));
revoke all on function public.save_web_notice_settings(uuid,integer,text),public.claim_web_notice(uuid,uuid,text),public.finish_web_notice(uuid,uuid,text,text,integer),app_private.queue_web_notices(),app_private.web_notice_file_access(text,text) from public,anon;
grant execute on function public.save_web_notice_settings(uuid,integer,text),public.claim_web_notice(uuid,uuid,text),public.finish_web_notice(uuid,uuid,text,text,integer),app_private.web_notice_file_access(text,text) to authenticated;
grant execute on function public.claim_web_notice(uuid,uuid,text),public.finish_web_notice(uuid,uuid,text,text,integer) to service_role;

create function public.assign_blocked_web_notice(p_company uuid,p_event uuid,p_expected_recipient text) returns void language plpgsql security definer set search_path='' as $$
declare e public.web_notice_events;staff text;
begin
 if not exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and m.role in ('owner','admin')) or not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select staff_email into staff from public.web_notice_settings where company_id=p_company for share;
 if staff is null then raise exception 'recipient_unavailable';end if;
 if p_expected_recipient is null or staff<>p_expected_recipient then raise exception 'recipient_changed' using errcode='PT409';end if;
 select * into e from public.web_notice_events where company_id=p_company and id=p_event for update;
 if not found or e.kind<>'staff' or e.status<>'blocked' or e.recipient is not null or e.mode is not null then raise exception 'notice_not_blocked';end if;
 if not exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and m.role in ('owner','admin')) or not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 update public.web_notice_events set recipient=staff,status='pending',snapshot=snapshot||jsonb_build_object('routingAssignedAt',now(),'routingAssignedBy',auth.uid()) where id=e.id;
end;$$;
revoke all on function public.assign_blocked_web_notice(uuid,uuid,text) from public,anon;
grant execute on function public.assign_blocked_web_notice(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
