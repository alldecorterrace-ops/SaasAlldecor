-- Invitations confer no membership until the verified recipient accepts.
begin;
create table public.company_invitations (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  email text not null check (email=lower(trim(email)) and length(email) between 3 and 254),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  status text not null default 'pending' check (status in ('pending','accepted','revoked','declined','expired')),
  accepted_by uuid references auth.users(id),
  resolved_at timestamptz,
  check ((status='accepted')=(accepted_by is not null)),
  check ((status='pending')=(resolved_at is null))
);
create unique index company_invitations_pending on public.company_invitations(company_id,email) where status='pending';
create index company_invitations_recipient on public.company_invitations(email) where status='pending';
alter table public.company_invitations enable row level security;
revoke all on public.company_invitations from public,anon,authenticated;
grant select on public.company_invitations to authenticated;
create policy invitation_manager_read on public.company_invitations for select to authenticated
  using(app_private.is_manager(company_id));
create trigger company_invitations_audit after insert or update on public.company_invitations
  for each row execute function app_private.audit_change();

create function public.create_company_invitation(p_company uuid,p_id uuid,p_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); previous public.company_invitations; result uuid;
begin
  -- Hold the issuer membership so a concurrent suspension cannot race creation.
  perform 1 from public.memberships where company_id=p_company and user_id=auth.uid()
    and active and role in ('owner','admin') for share;
  if not found then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_id is null or address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then raise exception 'invalid_invitation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||address,0));
  select * into previous from public.company_invitations where id=p_id;
  if found then
    if previous.company_id=p_company and previous.email=address and previous.invited_by=auth.uid()
      and previous.status='pending' and previous.expires_at>now() then return p_id; end if;
    raise exception 'invitation_conflict' using errcode='23505';
  end if;
  if exists(select 1 from public.memberships where company_id=p_company and lower(email)=address)
    then raise exception 'member_exists'; end if;
  update public.company_invitations set status='expired',resolved_at=now()
    where company_id=p_company and email=address and status='pending' and expires_at<=now();
  select id into result from public.company_invitations where company_id=p_company and email=address and status='pending';
  if result is not null then return result; end if;
  insert into public.company_invitations(id,company_id,email,invited_by) values(p_id,p_company,address,auth.uid());
  return p_id;
end; $$;

create function public.my_company_invitations() returns table(id uuid,company_name text,created_at timestamptz,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
  select i.id,c.name,i.created_at,i.expires_at from public.company_invitations i
  join public.companies c on c.id=i.company_id
  join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email
  join public.memberships issuer on issuer.company_id=i.company_id and issuer.user_id=i.invited_by
    and issuer.active and issuer.role in ('owner','admin')
  where i.status='pending' and i.expires_at>now()
  order by i.created_at desc limit 100;
$$;

create function public.respond_company_invitation(p_id uuid,p_accept boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation public.company_invitations; address text; existing public.memberships;
begin
  select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if address is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into invitation from public.company_invitations where id=p_id and email=address for update;
  if not found or p_accept is null then raise exception 'invitation_unavailable' using errcode='42501'; end if;
  -- Replay never restores a suspended member or resets their current permissions.
  if invitation.status='accepted' and p_accept and invitation.accepted_by=auth.uid() then
    if exists(select 1 from public.memberships where company_id=invitation.company_id and user_id=auth.uid() and active)
      then return invitation.company_id; end if;
    raise exception 'invitation_unavailable' using errcode='42501';
  end if;
  if invitation.status='declined' and not p_accept then return null; end if;
  if invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='42501'; end if;
  perform 1 from public.memberships where company_id=invitation.company_id and user_id=invitation.invited_by
    and active and role in ('owner','admin') for share;
  if not found then raise exception 'invitation_unavailable' using errcode='42501'; end if;
  if not p_accept then
    update public.company_invitations set status='declined',resolved_at=now() where id=p_id;
    return null;
  end if;
  insert into public.memberships(company_id,user_id,email,role,permissions)
    values(invitation.company_id,auth.uid(),address,'member','{}') on conflict do nothing;
  select * into existing from public.memberships where company_id=invitation.company_id and user_id=auth.uid() for update;
  if not existing.active then raise exception 'member_suspended' using errcode='42501'; end if;
  update public.company_invitations set status='accepted',accepted_by=auth.uid(),resolved_at=now() where id=p_id;
  return invitation.company_id;
end; $$;

create function public.revoke_company_invitation(p_company uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare invitation public.company_invitations;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select * into invitation from public.company_invitations where id=p_id and company_id=p_company for update;
  if not found then raise exception 'invitation_unavailable'; end if;
  if invitation.status='revoked' then return; end if;
  if invitation.status<>'pending' then raise exception 'invitation_conflict'; end if;
  update public.company_invitations set status='revoked',resolved_at=now() where id=p_id;
end; $$;

revoke all on function public.create_company_invitation(uuid,uuid,text),public.my_company_invitations(),
  public.respond_company_invitation(uuid,boolean),public.revoke_company_invitation(uuid,uuid) from public,anon;
grant execute on function public.create_company_invitation(uuid,uuid,text),public.my_company_invitations(),
  public.respond_company_invitation(uuid,boolean),public.revoke_company_invitation(uuid,uuid) to authenticated;
comment on table public.company_invitations is 'Email-bound invitations. Acceptance requires the current verified Auth email. No bearer token or automatic mail delivery.';
commit;
