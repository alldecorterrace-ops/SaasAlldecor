-- Platform control is separate from company membership. No ADT data/backfill.
begin;
create table public.platform_accounts (
 user_id uuid primary key references auth.users(id),
 role text not null check(role in ('administrator','manager')),
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.manager_invitations (
 id uuid primary key,
 email text not null check(email=lower(trim(email)) and length(email) between 3 and 254),
 invited_by uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','accepted','revoked','declined','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users(id),
 resolved_at timestamptz,
 check((status='accepted')=(accepted_by is not null)),
 check((status='pending')=(resolved_at is null))
);
create unique index manager_pending_email on public.manager_invitations(email) where status='pending';
create table public.manager_email_attempts (
 id uuid primary key default gen_random_uuid(),
 invitation_id uuid not null references public.manager_invitations(id),
 requested_by uuid not null references auth.users(id),
 status text not null default 'processing' check(status in ('processing','queued','failed','unknown')),
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
create table public.platform_audit_events (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id), entity text not null, entity_id text not null,
 operation text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create function app_private.is_platform_administrator() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_accounts p join auth.users u on u.id=p.user_id
  where p.user_id=auth.uid() and p.role='administrator' and p.active and u.email_confirmed_at is not null);
$$;
create function app_private.platform_access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.platform_accounts where user_id=auth.uid() and not active);
$$;
create function app_private.platform_audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare eid text;
begin
 if TG_TABLE_NAME='platform_accounts' then eid:=NEW.user_id::text; else eid:=NEW.id::text; end if;
 insert into public.platform_audit_events(actor_id,entity,entity_id,operation,before_data,after_data)
 values(auth.uid(),TG_TABLE_NAME,eid,TG_OP,
 case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW));
 return NEW;
end; $$;
revoke all on function app_private.is_platform_administrator(),app_private.platform_access_allowed(),app_private.platform_audit_change() from public,anon,authenticated;
grant execute on function app_private.is_platform_administrator(),app_private.platform_access_allowed() to authenticated;
create trigger platform_accounts_audit after insert or update on public.platform_accounts for each row execute function app_private.platform_audit_change();
create trigger manager_invitations_audit after insert or update on public.manager_invitations for each row execute function app_private.platform_audit_change();
create trigger manager_email_audit after insert or update on public.manager_email_attempts for each row execute function app_private.platform_audit_change();
alter table public.platform_accounts enable row level security;
alter table public.manager_invitations enable row level security;
alter table public.manager_email_attempts enable row level security;
alter table public.platform_audit_events enable row level security;
revoke all on public.platform_accounts,public.manager_invitations,public.manager_email_attempts,public.platform_audit_events from public,anon,authenticated;
grant select on public.platform_accounts,public.manager_invitations,public.manager_email_attempts,public.platform_audit_events to authenticated;
create policy platform_account_read on public.platform_accounts for select to authenticated using(user_id=auth.uid() or app_private.is_platform_administrator());
create policy manager_invite_read on public.manager_invitations for select to authenticated using(app_private.is_platform_administrator());
create policy manager_email_read on public.manager_email_attempts for select to authenticated using(app_private.is_platform_administrator());
create policy platform_audit_read on public.platform_audit_events for select to authenticated using(app_private.is_platform_administrator());

-- Bootstrap is an operator-only function, never a browser/admin promotion RPC.
create function app_private.bootstrap_platform_administrator(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('platform-bootstrap',0));
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null)
 then raise exception 'verified_account_required'; end if;
 if exists(select 1 from public.platform_accounts where role='administrator') then raise exception 'already_bootstrapped'; end if;
 insert into public.platform_accounts(user_id,role) values(p_user,'administrator');
end; $$;
revoke all on function app_private.bootstrap_platform_administrator(uuid) from public,anon,authenticated,service_role;

create function public.platform_context() returns table(role text,active boolean,can_create_company boolean)
language sql stable security definer set search_path='' as $$
 select p.role,p.active,p.role='manager' and p.active and u.email_confirmed_at is not null
 from public.platform_accounts p join auth.users u on u.id=p.user_id where p.user_id=auth.uid();
$$;
create function public.invite_platform_manager(p_id uuid,p_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); old public.manager_invitations; result uuid;
begin
 perform 1 from public.platform_accounts where user_id=auth.uid() and role='administrator' and active for share;
 if not found or not app_private.is_platform_administrator() then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_invitation'; end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-invite:'||address,0));
 select * into old from public.manager_invitations where id=p_id;
 if found then
  if old.email=address and old.invited_by=auth.uid() and old.status='pending' and old.expires_at>now() then return old.id; end if;
  raise exception 'invitation_conflict' using errcode='23505';
 end if;
 if exists(select 1 from public.platform_accounts p join auth.users u on u.id=p.user_id where lower(u.email)=address)
 then raise exception 'account_exists'; end if;
 update public.manager_invitations set status='expired',resolved_at=now() where email=address and status='pending' and expires_at<=now();
 select id into result from public.manager_invitations where email=address and status='pending';
 if result is not null then return result; end if;
 insert into public.manager_invitations(id,email,invited_by) values(p_id,address,auth.uid());
 return p_id;
end; $$;
create function public.my_manager_invitations() returns table(id uuid,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
 select i.id,i.expires_at from public.manager_invitations i
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email
 join public.platform_accounts issuer on issuer.user_id=i.invited_by and issuer.role='administrator' and issuer.active
 where i.status='pending' and i.expires_at>now() order by i.created_at desc limit 100;
$$;
create function public.respond_manager_invitation(p_id uuid,p_accept boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare address text; i public.manager_invitations; account public.platform_accounts;
begin
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if address is null then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into i from public.manager_invitations where id=p_id and email=address for update;
 if not found or p_accept is null then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if i.status='accepted' and p_accept and i.accepted_by=auth.uid() then
  if exists(select 1 from public.platform_accounts where user_id=auth.uid() and role='manager' and active) then return true; end if;
  raise exception 'account_suspended' using errcode='42501';
 end if;
 if i.status='declined' and not p_accept then return false; end if;
 if i.status<>'pending' or i.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 perform 1 from public.platform_accounts where user_id=i.invited_by and role='administrator' and active for share;
 if not found then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if not p_accept then update public.manager_invitations set status='declined',resolved_at=now() where id=i.id; return false; end if;
 insert into public.platform_accounts(user_id,role,approved_by) values(auth.uid(),'manager',i.invited_by) on conflict do nothing;
 select * into account from public.platform_accounts where user_id=auth.uid() for update;
 if account.role<>'manager' or not account.active then raise exception 'account_suspended' using errcode='42501'; end if;
 update public.manager_invitations set status='accepted',accepted_by=auth.uid(),resolved_at=now() where id=i.id;
 return true;
end; $$;
create function public.revoke_manager_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.manager_invitations;
begin
 if not app_private.is_platform_administrator() then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into i from public.manager_invitations where id=p_id for update;
 if not found then raise exception 'invitation_unavailable'; end if;
 if i.status='revoked' then return; end if;
 if i.status<>'pending' then raise exception 'invitation_conflict'; end if;
 update public.manager_invitations set status='revoked',resolved_at=now() where id=p_id;
end; $$;
create function public.set_platform_manager_active(p_user uuid,p_version integer,p_active boolean,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_platform_administrator() then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_confirmed is distinct from true or p_active is null then raise exception 'confirmation_required'; end if;
 update public.platform_accounts set active=p_active,version=version+1,updated_at=now()
 where user_id=p_user and role='manager' and version=p_version;
 if not found then raise exception 'version_conflict' using errcode='PT409'; end if;
end; $$;
create function public.platform_manager_overview() returns table(user_id uuid,email text,active boolean,version integer,company_count bigint)
language sql stable security definer set search_path='' as $$
 select p.user_id,u.email,p.active,p.version,(select count(*) from public.companies c where c.created_by=p.user_id)
 from public.platform_accounts p join auth.users u on u.id=p.user_id
 where p.role='manager' and app_private.is_platform_administrator() order by p.created_at desc limit 500;
$$;
create function public.platform_company_overview() returns table(id uuid,name text,manager_email text,member_count bigint,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.id,c.name,u.email,(select count(*) from public.memberships m where m.company_id=c.id and m.active),c.created_at
 from public.companies c join auth.users u on u.id=c.created_by
 where app_private.is_platform_administrator() order by c.created_at desc limit 500;
$$;
create function public.claim_manager_invitation_email(p_invitation uuid,p_retry boolean default false)
returns table(attempt_id uuid,email text,company_name text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare i public.manager_invitations; attempt uuid;
begin
 if not app_private.is_platform_administrator() then raise exception 'permission_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-invitation-mail',0));
 select * into i from public.manager_invitations where id=p_invitation for update;
 if not found or i.status<>'pending' or i.expires_at<=now() then raise exception 'invitation_unavailable'; end if;
 if not coalesce(p_retry,false) and exists(select 1 from public.manager_email_attempts where invitation_id=i.id) then return; end if;
 if exists(select 1 from public.manager_email_attempts where invitation_id=i.id and created_at>now()-interval '5 minutes')
 or (select count(*) from public.manager_email_attempts where invitation_id=i.id and created_at>now()-interval '24 hours')>=3
 or (select count(*) from public.manager_email_attempts where created_at>now()-interval '24 hours')>=50 then raise exception 'mail_rate_limited'; end if;
 insert into public.manager_email_attempts(invitation_id,requested_by) values(i.id,auth.uid()) returning id into attempt;
 return query select attempt,i.email,'Administración del SaaS'::text,i.expires_at;
end; $$;
create function public.finish_manager_invitation_email(p_attempt uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_platform_administrator() then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_status not in ('queued','failed','unknown') or p_status is null then raise exception 'invalid_mail_status'; end if;
 update public.manager_email_attempts set status=p_status,finished_at=now()
 where id=p_attempt and requested_by=auth.uid() and status='processing';
 if not found then raise exception 'mail_attempt_unavailable'; end if;
end; $$;

-- Suspended platform accounts cannot retain access through an old membership.
create or replace function app_private.is_member(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.platform_access_allowed() and exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active);
$$;
create or replace function app_private.is_manager(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.platform_access_allowed() and exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and m.role in ('owner','admin'));
$$;
create or replace function app_private.can_access(p_company uuid,p_module text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.platform_access_allowed() and exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active and (m.role in ('owner','admin') or coalesce(m.permissions->p_module ? p_action,false) or (p_action='read' and coalesce(m.permissions->p_module ? 'write',false))));
$$;
create or replace function public.set_member_access(p_company uuid,p_user uuid,p_role text,p_active boolean,p_permissions jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor_role text; target_role text; entry record; item jsonb;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select role into actor_role from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
  if actor_role is null or actor_role not in ('owner','admin') or p_user=auth.uid() then raise exception 'permission_denied' using errcode='42501'; end if;
  -- Serialize changes to the target; an owner cannot be removed via this API.
  select role into target_role from public.memberships where company_id=p_company and user_id=p_user for update;
  if target_role is null or target_role='owner' or (actor_role='admin' and (target_role='admin' or p_role='admin')) then
    raise exception 'permission_denied' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','member') or p_active is null or p_permissions is null or jsonb_typeof(p_permissions)<>'object' then raise exception 'invalid_permissions'; end if;
  for entry in select * from jsonb_each(p_permissions) loop
    if not exists(select 1 from public.module_catalog where id=entry.key) or jsonb_typeof(entry.value)<>'array' then raise exception 'invalid_permissions'; end if;
    for item in select value from jsonb_array_elements(entry.value) loop
      if item not in ('"read"'::jsonb,'"write"'::jsonb) then raise exception 'invalid_permissions'; end if;
    end loop;
  end loop;
  update public.memberships set role=p_role,active=p_active,permissions=p_permissions where company_id=p_company and user_id=p_user;
end; $$;

create or replace function public.create_company(p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.companies;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'authentication_required' using errcode='42501'; end if;
 perform 1 from public.platform_accounts where user_id=uid and role='manager' and active for share;
 if not found then raise exception 'manager_invitation_required' using errcode='42501'; end if;
 if p_id is null or p_name is null or length(trim(p_name)) not between 2 and 160 then raise exception 'invalid_company'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.companies where id=p_id;
 if found then
  if existing.created_by=uid and existing.name=trim(p_name) and app_private.is_manager(p_id) then return p_id; end if;
  raise exception 'request_conflict' using errcode='23505';
 end if;
 insert into public.companies(id,name,created_by) values(p_id,trim(p_name),uid);
 insert into public.memberships(company_id,user_id,email,role,permissions) values(p_id,uid,(select email from auth.users where id=uid),'owner','{}');
 return p_id;
end; $$;
revoke all on function public.platform_context(),public.invite_platform_manager(uuid,text),public.my_manager_invitations(),public.respond_manager_invitation(uuid,boolean),public.revoke_manager_invitation(uuid),public.set_platform_manager_active(uuid,integer,boolean,boolean),public.platform_manager_overview(),public.platform_company_overview(),public.claim_manager_invitation_email(uuid,boolean),public.finish_manager_invitation_email(uuid,text) from public,anon;
grant execute on function public.platform_context(),public.invite_platform_manager(uuid,text),public.my_manager_invitations(),public.respond_manager_invitation(uuid,boolean),public.revoke_manager_invitation(uuid),public.set_platform_manager_active(uuid,integer,boolean,boolean),public.platform_manager_overview(),public.platform_company_overview(),public.claim_manager_invitation_email(uuid,boolean),public.finish_manager_invitation_email(uuid,text) to authenticated;
commit;
