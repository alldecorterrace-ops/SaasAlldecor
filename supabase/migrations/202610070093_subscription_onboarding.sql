-- Subscription onboarding is additive. No existing business data is migrated/deleted.
begin;
alter table public.platform_accounts add column signup_source text not null default 'invitation'
 check(signup_source in ('invitation','subscription'));
create table public.billing_plans (
 code text primary key, name text not null, amount_cents integer not null check(amount_cents>0),
 user_limit integer not null check(user_limit between 1 and 1000), active boolean not null default true
);
insert into public.billing_plans(code,name,amount_cents,user_limit) values
 ('inicial','Inicial',2900,3),('equipo','Equipo',5900,5),
 ('profesional','Profesional',9900,10),('crecimiento','Crecimiento',17900,25);
create table public.billing_orders (
 id uuid primary key, email text not null check(email=lower(trim(email))), company_name text not null,
 plan_code text not null references public.billing_plans(code), mode text not null check(mode in ('test','live')),
 checkout_id text unique, subscription_id text unique, customer_id text,
 status text not null default 'pending' check(status in ('pending','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused','trialing')),
 payment_verified boolean not null default false, paid_through timestamptz,
 cancel_at_period_end boolean not null default false, event_created bigint not null default 0,
 owner_id uuid references auth.users(id), company_id uuid unique references public.companies(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((owner_id is null)=(company_id is null))
);
create index billing_order_email on public.billing_orders(email);
create table public.billing_event_receipts (
 event_id text primary key, body_hash text not null check(body_hash ~ '^[0-9a-f]{64}$'),
 order_id uuid not null references public.billing_orders(id), created_at timestamptz not null default now()
);
alter table public.billing_plans enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_event_receipts enable row level security;
revoke all on public.billing_plans,public.billing_orders,public.billing_event_receipts from public,anon,authenticated,service_role;
grant select on public.billing_orders to service_role;
create policy billing_service_read on public.billing_orders for select to service_role using(true);
create trigger billing_orders_audit after insert or update on public.billing_orders
 for each row execute function app_private.platform_audit_change();

create function public.prepare_billing_order(p_id uuid,p_email text,p_name text,p_code text,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
declare old public.billing_orders; address text:=lower(trim(p_email));
begin
 if p_id is null or address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_name is null or length(trim(p_name)) not between 2 and 160 or p_mode is null or p_mode not in ('test','live')
 or not exists(select 1 from public.billing_plans where code=p_code and active) then raise exception 'invalid_billing_order'; end if;
 if exists(select 1 from auth.users u join public.platform_accounts p on p.user_id=u.id where lower(u.email)=address and (p.role='administrator' or not p.active))
 then raise exception 'billing_account_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-order:'||p_id::text,0));
 select * into old from public.billing_orders where id=p_id;
 if found then
  if old.email=address and old.company_name=trim(p_name) and old.plan_code=p_code and old.mode=p_mode and old.company_id is null then return; end if;
  raise exception 'billing_order_conflict';
 end if;
 insert into public.billing_orders(id,email,company_name,plan_code,mode) values(p_id,address,trim(p_name),p_code,p_mode);
end; $$;
create function public.attach_billing_checkout(p_id uuid,p_checkout text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_checkout is null or p_checkout !~ '^cs_[a-zA-Z0-9_]+$' then raise exception 'invalid_checkout'; end if;
 update public.billing_orders set checkout_id=p_checkout,updated_at=now() where id=p_id and (checkout_id is null or checkout_id=p_checkout);
 if not found then raise exception 'billing_order_conflict'; end if;
end; $$;
-- Only the server holding the dedicated service credential can persist a signed, verified snapshot.
create function public.apply_billing_snapshot(p_event text,p_created bigint,p_hash text,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare old public.billing_orders; receipt public.billing_event_receipts; oid uuid:=(p_snapshot->>'order_id')::uuid;
 code text:=p_snapshot->>'plan_code'; current_status text:=p_snapshot->>'status'; initial boolean:=coalesce((p_snapshot->>'initial')::boolean,false);
begin
 if p_event is null or p_event !~ '^evt_[a-zA-Z0-9_]+$' or p_created is null or p_created<1
 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
 or code is null or not exists(select 1 from public.billing_plans where billing_plans.code=(p_snapshot->>'plan_code') and active)
 or current_status is null or current_status not in ('active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused','trialing')
 or coalesce(p_snapshot->>'subscription_id','') !~ '^sub_[a-zA-Z0-9_]+$'
 or coalesce(p_snapshot->>'customer_id','') !~ '^cus_[a-zA-Z0-9_]+$'
 then raise exception 'invalid_billing_snapshot'; end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-event:'||p_event,0));
 select * into receipt from public.billing_event_receipts where event_id=p_event;
 if found then
  if receipt.body_hash=p_hash and receipt.order_id=oid then return; end if;
  raise exception 'billing_event_conflict';
 end if;
 select * into old from public.billing_orders where id=oid for update;
 if not found or old.mode is distinct from p_snapshot->>'mode' then raise exception 'billing_order_unavailable'; end if;
 if initial then
  if old.checkout_id is distinct from p_snapshot->>'checkout_id' or old.plan_code<>code
    or old.email is distinct from lower(trim(p_snapshot->>'email')) then raise exception 'billing_checkout_mismatch'; end if;
 else
  if old.subscription_id is distinct from p_snapshot->>'subscription_id' or old.customer_id is distinct from p_snapshot->>'customer_id'
  then raise exception 'billing_subscription_mismatch'; end if;
 end if;
 if old.subscription_id is not null and old.subscription_id is distinct from p_snapshot->>'subscription_id'
 then raise exception 'billing_subscription_mismatch'; end if;
 insert into public.billing_event_receipts(event_id,body_hash,order_id) values(p_event,p_hash,oid);
 -- Out-of-order delivery cannot resurrect an older canceled/unpaid snapshot.
 if p_created<old.event_created then return; end if;
 -- Stripe terminal subscriptions cannot be reactivated. A stale provider read
 -- from a concurrent delivery may share the cancellation event's second.
 if old.status in ('canceled','incomplete_expired') and current_status<>old.status then return; end if;
 update public.billing_orders set plan_code=code,subscription_id=p_snapshot->>'subscription_id',customer_id=p_snapshot->>'customer_id',
 status=current_status,payment_verified=old.payment_verified or coalesce((p_snapshot->>'paid')::boolean,false),
 paid_through=case when coalesce((p_snapshot->>'paid')::boolean,false) then (p_snapshot->>'paid_through')::timestamptz else old.paid_through end,
 cancel_at_period_end=coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),
 event_created=p_created,updated_at=now() where id=oid;
end; $$;
revoke all on function public.prepare_billing_order(uuid,text,text,text,text),public.attach_billing_checkout(uuid,text),public.apply_billing_snapshot(text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_billing_order(uuid,text,text,text,text),public.attach_billing_checkout(uuid,text),public.apply_billing_snapshot(text,bigint,text,jsonb) to service_role;

create function app_private.billing_writable(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.billing_orders o where o.company_id=p_company
 and (not o.payment_verified or o.status<>'active' or o.paid_through is null or o.paid_through<=now()));
$$;
revoke all on function app_private.billing_writable(uuid) from public,anon,authenticated,service_role;
create function app_private.reserve_company_seat(p_company uuid) returns void
language plpgsql security definer set search_path='' as $$
declare maximum integer; seats bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing-seats:'||p_company::text,0));
 if not app_private.billing_writable(p_company) then raise exception 'subscription_inactive'; end if;
 select p.user_limit into maximum from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.company_id=p_company;
 if maximum is null then return; end if;
 select (select count(*) from public.memberships where company_id=p_company and active)
  +(select count(*) from public.company_invitations where company_id=p_company and status='pending' and expires_at>now()) into seats;
 if seats>=maximum then raise exception 'subscription_user_limit'; end if;
end; $$;
revoke all on function app_private.reserve_company_seat(uuid) from public,anon,authenticated,service_role;

-- Team administrators may invite and manage admins; neither can modify the payer/owner.
create or replace function app_private.company_invitation_issuer_allowed(p_user uuid,p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.billing_writable(p_company) and exists(select 1 from public.memberships m
 join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
 where m.user_id=p_user and m.company_id=p_company and m.active and m.role in ('owner','admin')
 and not exists(select 1 from public.platform_accounts p where p.user_id=p_user and (not p.active or p.role='administrator')));
$$;
create or replace function public.invite_company_user(p_company uuid,p_id uuid,p_email text,p_role text,p_permissions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); previous public.company_invitations; result uuid; item record; action text; actor_role text;
begin
  if not app_private.company_invitation_issuer_allowed(auth.uid(),p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select role into actor_role from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
  if p_role is null or p_role not in ('admin','member') then raise exception 'permission_denied' using errcode='42501'; end if;
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
  perform pg_advisory_xact_lock(hashtextextended('billing-seats:'||p_company::text,0));
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
  perform app_private.reserve_company_seat(p_company);
  insert into public.company_invitations(id,company_id,email,invited_by,role,permissions) values(p_id,p_company,address,auth.uid(),p_role,p_permissions);
  return p_id;
end; $$;

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
  if not found or not app_private.company_invitation_issuer_allowed(invitation.invited_by,invitation.company_id) then raise exception 'invitation_unavailable' using errcode='42501'; end if;
  if not p_accept then
    update public.company_invitations set status='declined',resolved_at=now() where id=p_id;
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing-seats:'||invitation.company_id::text,0));
  if not app_private.billing_writable(invitation.company_id) then raise exception 'subscription_inactive'; end if;
  insert into public.memberships(company_id,user_id,email,role,permissions)
    values(invitation.company_id,auth.uid(),address,invitation.role,invitation.permissions) on conflict do nothing;
  select * into existing from public.memberships where company_id=invitation.company_id and user_id=auth.uid() for update;
  if not existing.active then raise exception 'member_suspended' using errcode='42501'; end if;
  update public.company_invitations set status='accepted',accepted_by=auth.uid(),resolved_at=now() where id=p_id;
  return invitation.company_id;
end; $$;

create or replace function public.set_member_access(p_company uuid,p_user uuid,p_role text,p_active boolean,p_permissions jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor_role text; target_role text; entry record; item jsonb;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select role into actor_role from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
  if actor_role is null or actor_role not in ('owner','admin') or p_user=auth.uid() then raise exception 'permission_denied' using errcode='42501'; end if;
  -- Serialize changes to the target; an owner cannot be removed via this API.
  select role into target_role from public.memberships where company_id=p_company and user_id=p_user for update;
  if target_role is null or target_role='owner' then
    raise exception 'permission_denied' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','member') or p_active is null or p_permissions is null or jsonb_typeof(p_permissions)<>'object' then raise exception 'invalid_permissions'; end if;
  for entry in select * from jsonb_each(p_permissions) loop
    if not exists(select 1 from public.module_catalog where id=entry.key) or jsonb_typeof(entry.value)<>'array' then raise exception 'invalid_permissions'; end if;
    for item in select value from jsonb_array_elements(entry.value) loop
      if item not in ('"read"'::jsonb,'"write"'::jsonb) then raise exception 'invalid_permissions'; end if;
    end loop;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('billing-seats:'||p_company::text,0));
  if p_active and not exists(select 1 from public.memberships where company_id=p_company and user_id=p_user and active) then perform app_private.reserve_company_seat(p_company); end if;
  update public.memberships set role=p_role,active=p_active,permissions=p_permissions where company_id=p_company and user_id=p_user;
end; $$;



-- A payer is activated only after a verified payment AND verified email. Retrying is safe.
create function public.activate_my_paid_companies() returns integer
language plpgsql security definer set search_path='' as $$
declare address text; o public.billing_orders; cid uuid; n integer:=0;
begin
 if not app_private.platform_access_allowed() then return 0; end if;
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if address is null then return 0; end if;
 for o in select * from public.billing_orders where email=address and company_id is null
 and payment_verified and status='active' and paid_through>now() order by id for update loop
  cid:=o.id;
  insert into public.platform_accounts(user_id,role,signup_source) values(auth.uid(),'manager','subscription') on conflict do nothing;
  insert into public.companies(id,name,created_by) values(cid,o.company_name,auth.uid());
  insert into public.memberships(company_id,user_id,email,role,permissions) values(cid,auth.uid(),address,'owner','{}');
  update public.billing_orders set company_id=cid,owner_id=auth.uid(),updated_at=now() where id=o.id;
  n:=n+1;
 end loop;
 return n;
end; $$;
revoke all on function public.activate_my_paid_companies() from public,anon,service_role;
grant execute on function public.activate_my_paid_companies() to authenticated;

-- This public lookup stays a boolean. Account or invitation details are never exposed.
create or replace function public.registration_invitation_available(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(length(trim(p_email)) between 3 and 254
 and trim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 and (
 exists(select 1 from public.manager_invitations i join public.platform_accounts p on p.user_id=i.invited_by and p.role='administrator' and p.active
 join auth.users u on u.id=p.user_id and u.email_confirmed_at is not null where i.email=lower(trim(p_email)) and i.status='pending' and i.expires_at>now())
 or exists(select 1 from public.company_invitations i where i.email=lower(trim(p_email)) and i.status='pending' and i.expires_at>now()
 and app_private.company_invitation_issuer_allowed(i.invited_by,i.company_id))
 or exists(select 1 from public.billing_orders o where o.email=lower(trim(p_email)) and o.company_id is null and o.payment_verified and o.status='active' and o.paid_through>now())
 ),false);
$$;
create or replace function public.platform_context() returns table(role text,active boolean,can_create_company boolean)
language sql stable security definer set search_path='' as $$
 select p.role,p.active,p.role='manager' and p.active and p.signup_source='invitation' and u.email_confirmed_at is not null
 from public.platform_accounts p join auth.users u on u.id=p.user_id where p.user_id=auth.uid();
$$;
-- Paid owners use one new subscription per company. Existing invited managers are preserved.
create or replace function public.create_company(p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.companies;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'authentication_required' using errcode='42501'; end if;
 perform 1 from public.platform_accounts where user_id=uid and role='manager' and active and signup_source='invitation' for share;
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
-- Paid companies cannot bypass consent/quota through legacy direct-add functions.
create or replace function public.add_company_member(p_company uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 if exists(select 1 from public.billing_orders where company_id=p_company) then raise exception 'invitation_required'; end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if target is null then raise exception 'account_not_available'; end if;
 insert into public.memberships(company_id,user_id,email,role) values(p_company,target,(select email from auth.users where id=target),'member') on conflict do nothing;
end; $$;
-- Shared authorization makes inactive paid companies readable while writes are rejected.
create or replace function app_private.can_access(p_company uuid,p_module text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.platform_access_allowed() and (p_action='read' or app_private.billing_writable(p_company))
 and exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=auth.uid() and m.active
 and (m.role in ('owner','admin') or coalesce(m.permissions->p_module ? p_action,false) or (p_action='read' and coalesce(m.permissions->p_module ? 'write',false))));
$$;
-- Protect the paid owner even from direct maintenance writes, in addition to all RPCs.
create function app_private.protect_subscription_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.billing_orders o where o.company_id=OLD.company_id and o.owner_id=OLD.user_id)
 and (TG_OP='DELETE' or NEW.user_id<>OLD.user_id or NEW.company_id<>OLD.company_id or NEW.role<>'owner' or not NEW.active)
 then raise exception 'subscription_owner_protected' using errcode='42501'; end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
revoke all on function app_private.protect_subscription_owner() from public,anon,authenticated,service_role;
create trigger subscription_owner_guard before update or delete on public.memberships for each row execute function app_private.protect_subscription_owner();

-- Cover legacy writers too; canceled/expired subscriptions do not permit business mutations.
create function app_private.guard_subscription_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end; cid uuid;
 maximum integer; present bigint;
begin
 cid:=case when TG_TABLE_NAME='companies' then (row_data->>'id')::uuid else (row_data->>'company_id')::uuid end;
 if not app_private.billing_writable(cid) then raise exception 'subscription_inactive'; end if;
 if TG_TABLE_NAME='memberships' and TG_OP<>'DELETE' then
  if NEW.active and (TG_OP='INSERT' or not OLD.active) then
   perform pg_advisory_xact_lock(hashtextextended('billing-seats:'||cid::text,0));
   select p.user_limit into maximum from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.company_id=cid;
   select count(*) into present from public.memberships where company_id=cid and active;
   if maximum is not null and present>=maximum then raise exception 'subscription_user_limit'; end if;
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
revoke all on function app_private.guard_subscription_write() from public,anon,authenticated,service_role;
do $$declare item record; begin
 for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname not in ('audit_events','billing_orders','billing_event_receipts')
 and (c.relname='companies' or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped)) loop
  execute format('create trigger subscription_write_guard before insert or update or delete on public.%I for each row execute function app_private.guard_subscription_write()',item.relname);
 end loop;
end; $$;

create function public.company_subscription_summary(p_company uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',p.name,'plan_code',p.code,'amount_cents',p.amount_cents,'user_limit',p.user_limit,
 'status',o.status,'paid_through',o.paid_through,'mode',o.mode,'cancel_at_period_end',o.cancel_at_period_end,
 'active_users',(select count(*) from public.memberships where company_id=p_company and active),
 'pending_invitations',(select count(*) from public.company_invitations where company_id=p_company and status='pending' and expires_at>now()),
 'writable',app_private.billing_writable(p_company))
 from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.company_id=p_company and app_private.is_manager(p_company);
$$;
create function public.subscription_portal_customer(p_company uuid) returns text
language sql stable security definer set search_path='' as $$
 select o.customer_id from public.billing_orders o join public.memberships m on m.company_id=o.company_id and m.user_id=o.owner_id and m.active and m.role='owner'
 where o.company_id=p_company and o.owner_id=auth.uid() and app_private.platform_access_allowed();
$$;
revoke all on function public.company_subscription_summary(uuid),public.subscription_portal_customer(uuid) from public,anon,service_role;
grant execute on function public.company_subscription_summary(uuid),public.subscription_portal_customer(uuid) to authenticated;
commit;
