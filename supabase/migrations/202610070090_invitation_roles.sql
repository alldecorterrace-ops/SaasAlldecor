-- New invitations carry their intended company role. Existing memberships stay unchanged.
begin;
alter table public.company_invitations add column role text not null default 'member' check(role in ('admin','member'));
alter table public.company_invitations add column permissions jsonb not null default '{}' check(jsonb_typeof(permissions)='object');
create function public.invite_company_user(p_company uuid,p_id uuid,p_email text,p_role text,p_permissions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); previous public.company_invitations; result uuid; item record; action text; actor_role text;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select role into actor_role from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
  if p_role is null or p_role not in ('admin','member') or (p_role='admin' and actor_role<>'owner') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_permissions is null or jsonb_typeof(p_permissions)<>'object' or (p_role='admin' and p_permissions<>'{}') then raise exception 'invalid_permissions'; end if;
  for item in select key,value from jsonb_each(p_permissions) loop
    if item.key in ('ia','nuevo3d','pergolamotor') or not exists(select 1 from public.module_catalog where id=item.key) or jsonb_typeof(item.value)<>'array' then raise exception 'invalid_permissions'; end if;
    for action in select jsonb_array_elements_text(item.value) loop
      if action not in ('read','write') then raise exception 'invalid_permissions'; end if;
    end loop;
  end loop;
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
      and previous.role=p_role and previous.permissions=p_permissions and previous.status='pending' and previous.expires_at>now() then return p_id; end if;
    raise exception 'invitation_conflict' using errcode='23505';
  end if;
  if exists(select 1 from public.memberships where company_id=p_company and lower(email)=address)
    then raise exception 'member_exists'; end if;
  update public.company_invitations set status='expired',resolved_at=now()
    where company_id=p_company and email=address and status='pending' and expires_at<=now();
  select id into result from public.company_invitations where company_id=p_company and email=address and status='pending';
  if result is not null then
    if exists(select 1 from public.company_invitations where id=result and role=p_role and permissions=p_permissions and invited_by=auth.uid()) then return result; end if;
    raise exception 'invitation_conflict';
  end if;
  insert into public.company_invitations(id,company_id,email,invited_by,role,permissions) values(p_id,p_company,address,auth.uid(),p_role,p_permissions);
  return p_id;
end; $$;


create or replace function public.create_company_invitation(p_company uuid,p_id uuid,p_email text) returns uuid
language sql security definer set search_path='' as $$
 select public.invite_company_user(p_company,p_id,p_email,'member','{}'::jsonb);
$$;
create or replace function public.respond_company_invitation(p_id uuid,p_accept boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation public.company_invitations; address text; existing public.memberships;
begin
  if not app_private.platform_access_allowed() then raise exception 'account_suspended' using errcode='42501'; end if;
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
  if not found or exists(select 1 from public.platform_accounts where user_id=invitation.invited_by and not active) then raise exception 'invitation_unavailable' using errcode='42501'; end if;
  if not p_accept then
    update public.company_invitations set status='declined',resolved_at=now() where id=p_id;
    return null;
  end if;
  insert into public.memberships(company_id,user_id,email,role,permissions)
    values(invitation.company_id,auth.uid(),address,invitation.role,invitation.permissions) on conflict do nothing;
  select * into existing from public.memberships where company_id=invitation.company_id and user_id=auth.uid() for update;
  if not existing.active then raise exception 'member_suspended' using errcode='42501'; end if;
  update public.company_invitations set status='accepted',accepted_by=auth.uid(),resolved_at=now() where id=p_id;
  return invitation.company_id;
end; $$;


create function public.my_company_role_invitations() returns table(id uuid,company_name text,expires_at timestamptz,role text,permissions jsonb)
language sql stable security definer set search_path='' as $$
 select i.id,c.name,i.expires_at,i.role,i.permissions from public.company_invitations i
 join public.companies c on c.id=i.company_id
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email
 join public.memberships issuer on issuer.company_id=i.company_id and issuer.user_id=i.invited_by and issuer.active and issuer.role in ('owner','admin')
 where i.status='pending' and i.expires_at>now() and app_private.platform_access_allowed()
 and not exists(select 1 from public.platform_accounts where user_id=i.invited_by and not active)
 order by i.created_at desc limit 100;
$$;
revoke all on function public.invite_company_user(uuid,uuid,text,text,jsonb),public.my_company_role_invitations() from public,anon;
grant execute on function public.invite_company_user(uuid,uuid,text,text,jsonb),public.my_company_role_invitations() to authenticated;
commit;
