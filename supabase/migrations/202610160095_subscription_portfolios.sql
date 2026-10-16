-- A subscription covers a portfolio. Existing orders keep their original catalog.
-- No business records are imported, removed, or assigned to a different owner.
begin;
create table public.billing_plan_catalog (
 catalog_version text not null, code text not null references public.billing_plans(code),
 name text not null, amount_cents integer not null check(amount_cents>0),
 user_limit integer check(user_limit>0), company_limit integer check(company_limit>0),
 invoice_limit integer check(invoice_limit>0), support text not null check(support in ('standard','email','phone')),
 custom_website boolean not null default false, custom_modules boolean not null default false,
 primary key(catalog_version,code)
);
insert into public.billing_plan_catalog(catalog_version,code,name,amount_cents,user_limit,company_limit,support)
 select '20261007',code,name,amount_cents,user_limit,1,'standard' from public.billing_plans;
insert into public.billing_plan_catalog values
 ('20261016','inicial','Inicial',2999,1,1,10,'standard',false,false),
 ('20261016','equipo','Equipo',9999,5,3,100,'standard',false,false),
 ('20261016','profesional','Profesional',29999,21,null,null,'email',false,false),
 ('20261016','crecimiento','Crecimiento',49999,null,null,null,'phone',true,true);
alter table public.billing_plans alter column user_limit drop not null;
alter table public.billing_plans drop constraint billing_plans_user_limit_check;
alter table public.billing_plans add constraint billing_plans_user_limit_check check(user_limit>0);
update public.billing_plans p set amount_cents=c.amount_cents,user_limit=c.user_limit
 from public.billing_plan_catalog c where c.catalog_version='20261016' and c.code=p.code;
alter table public.billing_orders add column catalog_version text not null default '20261007';
alter table public.billing_orders add foreign key(catalog_version,plan_code) references public.billing_plan_catalog(catalog_version,code);
alter table public.billing_reactivations add column catalog_version text not null default '20261007';
alter table public.billing_reactivations add foreign key(catalog_version,plan_code) references public.billing_plan_catalog(catalog_version,code);

create table public.billing_company_links (
 company_id uuid primary key references public.companies(id),
 order_id uuid not null references public.billing_orders(id),
 created_at timestamptz not null default now()
);
create index billing_company_order on public.billing_company_links(order_id);
insert into public.billing_company_links(company_id,order_id)
 select company_id,id from public.billing_orders where company_id is not null;
-- A permanent issuance ledger prevents backdating, voiding, or deleting from refunding quota.
create table public.billing_invoice_usage (
 invoice_id uuid primary key, order_id uuid not null references public.billing_orders(id),
 company_id uuid not null references public.companies(id), issued_at timestamptz not null,
 usage_month date not null
);
create index billing_invoice_month on public.billing_invoice_usage(order_id,usage_month);
-- Index already-issued SaaS invoices without changing any business record. A later
-- reactivation onto the current catalog must retain this month's previous usage.
insert into public.billing_invoice_usage(invoice_id,order_id,company_id,issued_at,usage_month)
 select i.id,l.order_id,i.company_id,i.created_at,date_trunc('month',i.created_at at time zone 'UTC')::date
 from public.invoices i join public.billing_company_links l on l.company_id=i.company_id;
alter table public.billing_plan_catalog enable row level security;
alter table public.billing_company_links enable row level security;
alter table public.billing_invoice_usage enable row level security;
revoke all on public.billing_plan_catalog,public.billing_company_links,public.billing_invoice_usage from public,anon,authenticated,service_role;

create function app_private.subscription_for_company(p_company uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select order_id from public.billing_company_links where company_id=p_company;
$$;
create function app_private.lock_subscription(p_company uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 select order_id into oid from public.billing_company_links where company_id=p_company;
 if oid is not null then perform 1 from public.billing_orders where id=oid for update;
 else perform pg_advisory_xact_lock(hashtextextended('billing-seats:'||p_company::text,0)); end if;
 return oid;
end; $$;
create or replace function app_private.billing_writable(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.billing_company_links l join public.billing_orders o on o.id=l.order_id
 where l.company_id=p_company and (not o.payment_verified or o.status<>'active' or o.paid_through is null or o.paid_through<=now()));
$$;
create function app_private.subscription_seats(p_order uuid)
returns table(identity text,active boolean)
language sql stable security definer set search_path='' as $$
 select x.identity,bool_or(x.active) from (
  select 'user:'||o.owner_id::text identity,true active from public.billing_orders o where o.id=p_order and o.owner_id is not null
  union all
  select 'user:'||m.user_id::text,true from public.memberships m join public.billing_company_links l on l.company_id=m.company_id
   where l.order_id=p_order and m.active
  union all
  select coalesce('user:'||u.id::text,'email:'||i.email),false
   from public.company_invitations i join public.billing_company_links l on l.company_id=i.company_id
   left join auth.users u on lower(u.email)=i.email
   where l.order_id=p_order and i.status='pending' and i.expires_at>now()
 ) x group by x.identity;
$$;
create function app_private.reserve_company_seat(p_company uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare oid uuid; maximum integer; seats bigint; person text;
begin
 oid:=app_private.lock_subscription(p_company);
 if not app_private.billing_writable(p_company) then raise exception 'subscription_inactive'; end if;
 if oid is null then return; end if;
 select p.user_limit into maximum from public.billing_orders o join public.billing_plan_catalog p
 on p.code=o.plan_code and p.catalog_version=o.catalog_version where o.id=oid;
 if maximum is null then return; end if;
 select coalesce((select 'user:'||id::text from auth.users where lower(email)=lower(trim(p_email))),
 'email:'||lower(trim(p_email))) into person;
 select count(*) into seats from (select identity from app_private.subscription_seats(oid) union select person) s;
 if seats>maximum then raise exception 'subscription_user_limit'; end if;
end; $$;
-- Compatibility for internal legacy callers. New invitation/member paths pass identity.
create or replace function app_private.reserve_company_seat(p_company uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.reserve_company_seat(p_company,'reserved-'||gen_random_uuid()::text||'@quota.invalid');
end; $$;

create function app_private.link_subscription_root() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if NEW.company_id is not null and (TG_OP='INSERT' or OLD.company_id is null) then
  insert into public.billing_company_links(company_id,order_id) values(NEW.company_id,NEW.id);
 end if;
 return NEW;
end; $$;
create trigger billing_link_root after insert or update on public.billing_orders
 for each row execute function app_private.link_subscription_root();

create or replace function app_private.protect_subscription_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.billing_company_links l join public.billing_orders o on o.id=l.order_id
 where l.company_id=OLD.company_id and o.owner_id=OLD.user_id)
 and (TG_OP='DELETE' or NEW.user_id<>OLD.user_id or NEW.company_id<>OLD.company_id or NEW.role<>'owner' or not NEW.active)
 then raise exception 'subscription_owner_protected' using errcode='42501'; end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
create or replace function app_private.guard_subscription_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end; cid uuid;
begin
 cid:=case when TG_TABLE_NAME='companies' then (row_data->>'id')::uuid else (row_data->>'company_id')::uuid end;
 if not app_private.billing_writable(cid) then raise exception 'subscription_inactive'; end if;
 if TG_TABLE_NAME='memberships' and TG_OP<>'DELETE' then
  if NEW.active and (TG_OP='INSERT' or not OLD.active or NEW.user_id<>OLD.user_id or NEW.company_id<>OLD.company_id) then
   perform app_private.reserve_company_seat(cid,(select email from auth.users where id=NEW.user_id));
  end if;
 elsif TG_TABLE_NAME='company_invitations' and TG_OP<>'DELETE' then
  if NEW.status='pending' and NEW.expires_at>now() then
   perform app_private.reserve_company_seat(cid,NEW.email);
  end if;
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;

create function app_private.count_subscription_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
declare oid uuid; maximum integer; used bigint; issued timestamptz; month_start date;
begin
 oid:=app_private.lock_subscription(NEW.company_id);
 if oid is null then return NEW; end if;
 if not app_private.billing_writable(NEW.company_id) then raise exception 'subscription_inactive'; end if;
 if exists(select 1 from public.billing_invoice_usage where invoice_id=NEW.id) then return NEW; end if;
 issued:=clock_timestamp();
 month_start:=date_trunc('month',issued at time zone 'UTC')::date;
 select p.invoice_limit into maximum from public.billing_orders o join public.billing_plan_catalog p
 on p.code=o.plan_code and p.catalog_version=o.catalog_version where o.id=oid;
 select count(*) into used from public.billing_invoice_usage where order_id=oid and usage_month=month_start;
 if maximum is not null and used>=maximum then raise exception 'subscription_invoice_limit'; end if;
 insert into public.billing_invoice_usage(invoice_id,order_id,company_id,issued_at,usage_month)
 values(NEW.id,oid,NEW.company_id,issued,month_start);
 return NEW;
end; $$;
create trigger subscription_invoice_quota after insert on public.invoices
 for each row execute function app_private.count_subscription_invoice();

create function public.create_subscription_company(p_order uuid,p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; previous public.companies; maximum integer; address text;
begin
 if not app_private.platform_access_allowed() then raise exception 'permission_denied' using errcode='42501'; end if;
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into o from public.billing_orders where id=p_order and owner_id=auth.uid() for update;
 if not found or address is null or not exists(select 1 from public.platform_accounts
 where user_id=auth.uid() and role='manager' and active) then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_name is null or length(trim(p_name)) not between 2 and 160 then raise exception 'invalid_company'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into previous from public.companies where id=p_id;
 if found then
  if previous.created_by=auth.uid() and previous.name=trim(p_name)
  and exists(select 1 from public.billing_company_links where company_id=p_id and order_id=p_order) then return p_id; end if;
  raise exception 'request_conflict' using errcode='23505';
 end if;
 if not o.payment_verified or o.status<>'active' or o.paid_through is null or o.paid_through<=now()
 then raise exception 'subscription_inactive'; end if;
 select company_limit into maximum from public.billing_plan_catalog where code=o.plan_code and catalog_version=o.catalog_version;
 if maximum is not null and (select count(*) from public.billing_company_links where order_id=o.id)>=maximum
 then raise exception 'subscription_company_limit'; end if;
 insert into public.companies(id,name,created_by) values(p_id,trim(p_name),auth.uid());
 insert into public.billing_company_links(company_id,order_id) values(p_id,o.id);
 insert into public.memberships(company_id,user_id,email,role,permissions) values(p_id,auth.uid(),address,'owner','{}');
 return p_id;
end; $$;

create or replace function public.platform_context() returns table(role text,active boolean,can_create_company boolean)
language sql stable security definer set search_path='' as $$
 select p.role,p.active,p.role='manager' and p.active and u.email_confirmed_at is not null and
 (p.signup_source='invitation' or exists(select 1 from public.billing_orders o join public.billing_plan_catalog c
 on c.code=o.plan_code and c.catalog_version=o.catalog_version where o.owner_id=p.user_id and o.payment_verified
 and o.status='active' and o.paid_through>now() and (c.company_limit is null or
 (select count(*) from public.billing_company_links where order_id=o.id)<c.company_limit)))
 from public.platform_accounts p join auth.users u on u.id=p.user_id where p.user_id=auth.uid();
$$;

create function app_private.subscription_summary(p_order uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'company_id',o.company_id,'plan',p.name,'plan_code',p.code,
 'catalog_version',o.catalog_version,'amount_cents',p.amount_cents,'user_limit',p.user_limit,
 'company_limit',p.company_limit,'invoice_limit',p.invoice_limit,'support',p.support,
 'custom_website',p.custom_website,'custom_modules',p.custom_modules,
 'status',o.status,'paid_through',o.paid_through,'mode',o.mode,'cancel_at_period_end',o.cancel_at_period_end,
 'active_users',(select count(*) from app_private.subscription_seats(o.id) where active),
 'pending_invitations',(select count(*) from app_private.subscription_seats(o.id) where not active),
 'companies',(select count(*) from public.billing_company_links where order_id=o.id),
 'invoices_this_month',(select count(*) from public.billing_invoice_usage where order_id=o.id and usage_month=date_trunc('month',now() at time zone 'UTC')::date),
 'invoice_period_start',date_trunc('month',now() at time zone 'UTC')::date,
 'invoice_period_end',(date_trunc('month',now() at time zone 'UTC')+interval '1 month')::date,
 'writable',app_private.billing_writable(o.company_id),
 'can_reactivate',o.owner_id=auth.uid() and o.status in ('canceled','incomplete_expired'),
 'reactivation_plan',(select r.plan_code from public.billing_reactivations r where r.order_id=o.id and r.status='pending'))
 from public.billing_orders o join public.billing_plan_catalog p on p.code=o.plan_code and p.catalog_version=o.catalog_version where o.id=p_order;
$$;
create or replace function public.company_subscription_summary(p_company uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select app_private.subscription_summary(app_private.subscription_for_company(p_company)) where app_private.is_manager(p_company);
$$;
create function public.my_subscription_portfolios() returns setof jsonb
language sql stable security definer set search_path='' as $$
 select app_private.subscription_summary(id) from public.billing_orders
 where owner_id=auth.uid() and app_private.platform_access_allowed() order by created_at,id;
$$;
create function public.company_invoice_allowance(p_company uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('limit',p.invoice_limit,'used',(select count(*) from public.billing_invoice_usage
 where order_id=o.id and usage_month=date_trunc('month',now() at time zone 'UTC')::date),
 'resets_at',(date_trunc('month',now() at time zone 'UTC')+interval '1 month')::date)
 from public.billing_orders o join public.billing_plan_catalog p on p.code=o.plan_code and p.catalog_version=o.catalog_version
 join public.billing_company_links l on l.order_id=o.id where l.company_id=p_company
 and (app_private.can_access(p_company,'fin-invoices','read') or app_private.can_access(p_company,'fin-estimados','write'));
$$;
create or replace function public.subscription_portal_customer(p_company uuid) returns text
language sql stable security definer set search_path='' as $$
 select o.customer_id from public.billing_orders o join public.billing_company_links l on l.order_id=o.id
 join public.memberships m on m.company_id=l.company_id and m.user_id=o.owner_id and m.active and m.role='owner'
 where l.company_id=p_company and o.owner_id=auth.uid() and app_private.platform_access_allowed();
$$;

-- Function definitions retaining the established onboarding/invitation/webhook checks follow.
create or replace function public.prepare_billing_order(p_id uuid,p_email text,p_name text,p_code text,p_mode text) returns void
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
  if old.email=address and old.company_name=trim(p_name) and old.plan_code=p_code and old.mode=p_mode and old.company_id is null and old.catalog_version='20261016' then return; end if;
  raise exception 'billing_order_conflict';
 end if;
 insert into public.billing_orders(id,email,company_name,plan_code,mode,catalog_version) values(p_id,address,trim(p_name),p_code,p_mode,'20261016');
end; $$;

create or replace function public.invite_company_user(p_company uuid,p_id uuid,p_email text,p_role text,p_permissions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare address text:=lower(trim(p_email)); previous public.company_invitations; result uuid; item record; action text; actor_role text;
begin
  if not app_private.company_invitation_issuer_allowed(auth.uid(),p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  perform app_private.lock_subscription(p_company);
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
  perform app_private.reserve_company_seat(p_company,address);
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
  select * into invitation from public.company_invitations where id=p_id and email=address;
  if not found or p_accept is null then raise exception 'invitation_unavailable' using errcode='42501'; end if;
  perform app_private.lock_subscription(invitation.company_id);
  select * into invitation from public.company_invitations where id=p_id and email=address for update;
  if not found then raise exception 'invitation_unavailable' using errcode='42501'; end if;
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
  perform app_private.lock_subscription(p_company);
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
  if p_active and not exists(select 1 from public.memberships where company_id=p_company and user_id=p_user and active) then perform app_private.reserve_company_seat(p_company,(select email from auth.users where id=p_user)); end if;
  update public.memberships set role=p_role,active=p_active,permissions=p_permissions where company_id=p_company and user_id=p_user;
end; $$;

create or replace function public.add_company_member(p_company uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
 if exists(select 1 from public.billing_company_links where company_id=p_company) then raise exception 'invitation_required'; end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if target is null then raise exception 'account_not_available'; end if;
 insert into public.memberships(company_id,user_id,email,role) values(p_company,target,(select email from auth.users where id=target),'member') on conflict do nothing;
end; $$;

create or replace function public.prepare_company_reactivation(p_company uuid,p_id uuid,p_code text,p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; r public.billing_reactivations; address text; maximum integer; seats bigint; company_maximum integer;
begin
 if auth.uid() is null or not app_private.platform_access_allowed() then raise exception 'permission_denied' using errcode='42501'; end if;
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select b.* into o from public.billing_orders b join public.billing_company_links l on l.order_id=b.id
 join public.memberships m on m.company_id=l.company_id and m.user_id=b.owner_id
 where l.company_id=p_company and b.owner_id=auth.uid() and m.active and m.role='owner' for update of b;
 if not found or address is null then raise exception 'permission_denied' using errcode='42501'; end if;
 if o.email is distinct from address then raise exception 'billing_owner_email_changed'; end if;
 if o.status not in ('canceled','incomplete_expired') then raise exception 'billing_reactivation_not_needed'; end if;
 if p_id is null or p_mode is distinct from o.mode or o.customer_id is null or o.subscription_id is null
 then raise exception 'invalid_billing_reactivation'; end if;
 select user_limit,company_limit into maximum,company_maximum from public.billing_plan_catalog where code=p_code and catalog_version='20261016';
 if not found then raise exception 'invalid_billing_reactivation'; end if;
 select count(*) into seats from app_private.subscription_seats(o.id);
 if maximum is not null and seats>maximum then raise exception 'subscription_user_limit'; end if;
 if company_maximum is not null and (select count(*) from public.billing_company_links where order_id=o.id)>company_maximum then raise exception 'subscription_company_limit'; end if;
 select * into r from public.billing_reactivations where order_id=o.id and status='pending' for update;
 if found then
  if r.catalog_version<>'20261016' or r.plan_code is distinct from p_code or r.mode is distinct from p_mode or r.owner_id is distinct from auth.uid()
  or r.previous_subscription_id is distinct from o.subscription_id then raise exception 'billing_reactivation_conflict'; end if;
  return app_private.reactivation_offer(r.id);
 end if;
 if exists(select 1 from public.billing_reactivations where id=p_id) then raise exception 'billing_reactivation_conflict'; end if;
 insert into public.billing_reactivations(id,order_id,company_id,owner_id,email,plan_code,mode,customer_id,previous_subscription_id,catalog_version)
 values(p_id,o.id,o.company_id,auth.uid(),address,p_code,p_mode,o.customer_id,o.subscription_id,'20261016');
 return app_private.reactivation_offer(p_id);
end; $$;

create or replace function public.apply_billing_snapshot(p_event text,p_created bigint,p_hash text,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare old public.billing_orders; receipt public.billing_event_receipts; r public.billing_reactivations;
 oid uuid:=(p_snapshot->>'order_id')::uuid; rid uuid:=nullif(p_snapshot->>'reactivation_id','')::uuid;
 code text:=p_snapshot->>'plan_code'; current_status text:=p_snapshot->>'status';
 initial boolean:=coalesce((p_snapshot->>'initial')::boolean,false); seats bigint; maximum integer; company_maximum integer; catalog text:=coalesce(p_snapshot->>'catalog_version','20261007');
begin
 if p_event is null or p_event !~ '^evt_[a-zA-Z0-9_]+$' or p_created is null or p_created<1
 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
 or code is null or not exists(select 1 from public.billing_plan_catalog p where p.code=(p_snapshot->>'plan_code') and p.catalog_version=catalog)
 or current_status is null or current_status not in ('active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused','trialing')
 or coalesce(p_snapshot->>'subscription_id','') !~ '^sub_[a-zA-Z0-9_]+$'
 or coalesce(p_snapshot->>'customer_id','') !~ '^cus_[a-zA-Z0-9_]+$' then raise exception 'invalid_billing_snapshot'; end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-event:'||p_event,0));
 select * into receipt from public.billing_event_receipts where event_id=p_event;
 if found then
  if receipt.body_hash=p_hash and receipt.order_id=oid then return; end if;
  raise exception 'billing_event_conflict';
 end if;
 select * into old from public.billing_orders where id=oid for update;
 if not found or old.mode is distinct from p_snapshot->>'mode' then raise exception 'billing_order_unavailable'; end if;
 -- A paid replacement starts a new subscription epoch. Retired events stay auditable
 -- but cannot overwrite the current plan, status, paid period or cancellation.
 if old.subscription_id is not null and old.subscription_id is distinct from p_snapshot->>'subscription_id'
 and exists(select 1 from public.billing_reactivations h where h.order_id=oid and h.status='activated'
 and h.previous_subscription_id=p_snapshot->>'subscription_id' and h.customer_id=p_snapshot->>'customer_id'
 and (not initial or (h.previous_snapshot->>'checkout_id'=p_snapshot->>'checkout_id'
 and h.previous_snapshot->>'email'=lower(trim(p_snapshot->>'email'))))) then
  insert into public.billing_event_receipts(event_id,body_hash,order_id) values(p_event,p_hash,oid);
  return;
 end if;
 -- Inference preserves webhook compatibility with the previous application release.
 if rid is null then
  select id into rid from public.billing_reactivations where order_id=oid and
  ((initial and checkout_id=p_snapshot->>'checkout_id') or (not initial and subscription_id=p_snapshot->>'subscription_id'));
 end if;
 if rid is not null then
  select * into r from public.billing_reactivations where id=rid and order_id=oid for update;
  if not found or r.catalog_version is distinct from catalog or r.status='expired' or r.mode is distinct from old.mode or r.customer_id is distinct from p_snapshot->>'customer_id'
  then raise exception 'billing_reactivation_mismatch'; end if;
  if r.status='pending' then
   if r.plan_code is distinct from code or r.previous_subscription_id is distinct from old.subscription_id or old.status not in ('canceled','incomplete_expired')
   or r.company_id is distinct from old.company_id or r.owner_id is distinct from old.owner_id
   then raise exception 'billing_reactivation_mismatch'; end if;
   if initial then
    if r.checkout_id is distinct from p_snapshot->>'checkout_id' or r.email is distinct from lower(trim(p_snapshot->>'email'))
    or (r.subscription_id is not null and r.subscription_id is distinct from p_snapshot->>'subscription_id')
    then raise exception 'billing_checkout_mismatch'; end if;
    update public.billing_reactivations set checkout_verified=true,subscription_id=p_snapshot->>'subscription_id',updated_at=now() where id=rid;
   elsif not r.checkout_verified or r.subscription_id is distinct from p_snapshot->>'subscription_id' then
    raise exception 'billing_reactivation_checkout_unverified';
   end if;
   if current_status='active' and coalesce((p_snapshot->>'paid')::boolean,false) and (p_snapshot->>'paid_through')::timestamptz>now() then
    if not exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id
    where m.company_id=old.company_id and m.user_id=old.owner_id and m.role='owner' and m.active
    and u.email_confirmed_at is not null and lower(u.email)=r.email) then raise exception 'billing_owner_unavailable'; end if;
    select user_limit,company_limit into maximum,company_maximum from public.billing_plan_catalog p where p.code=(p_snapshot->>'plan_code') and p.catalog_version=catalog;
    select count(*) into seats from app_private.subscription_seats(old.id);
    if maximum is not null and seats>maximum then raise exception 'subscription_user_limit'; end if;
    if company_maximum is not null and (select count(*) from public.billing_company_links where order_id=old.id)>company_maximum then raise exception 'subscription_company_limit'; end if;
    update public.billing_reactivations set status='activated',previous_snapshot=to_jsonb(old),activated_at=now(),updated_at=now() where id=rid;
    update public.billing_orders set catalog_version=catalog,plan_code=code,checkout_id=r.checkout_id,subscription_id=p_snapshot->>'subscription_id',
    status=current_status,payment_verified=true,paid_through=(p_snapshot->>'paid_through')::timestamptz,
    cancel_at_period_end=coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),event_created=p_created,updated_at=now() where id=oid;
   end if;
   insert into public.billing_event_receipts(event_id,body_hash,order_id) values(p_event,p_hash,oid);
   return;
  end if;
  if r.subscription_id is distinct from old.subscription_id or r.subscription_id is distinct from p_snapshot->>'subscription_id'
  then raise exception 'billing_reactivation_mismatch'; end if;
 end if;
 if old.catalog_version is distinct from catalog then raise exception 'billing_catalog_mismatch'; end if;
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
 if p_created<old.event_created then return; end if;
 if old.status in ('canceled','incomplete_expired') and current_status<>old.status then return; end if;
 update public.billing_orders set plan_code=code,subscription_id=p_snapshot->>'subscription_id',customer_id=p_snapshot->>'customer_id',
 status=current_status,payment_verified=old.payment_verified or coalesce((p_snapshot->>'paid')::boolean,false),
 paid_through=case when coalesce((p_snapshot->>'paid')::boolean,false) then (p_snapshot->>'paid_through')::timestamptz else old.paid_through end,
 cancel_at_period_end=coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),event_created=p_created,updated_at=now() where id=oid;
end; $$;

revoke all on function public.create_subscription_company(uuid,uuid,text),public.my_subscription_portfolios(),public.company_invoice_allowance(uuid) from public,anon,service_role;
grant execute on function public.create_subscription_company(uuid,uuid,text),public.my_subscription_portfolios(),public.company_invoice_allowance(uuid) to authenticated;
do $$ declare p record; begin
 for p in select n.nspname,pr.proname,pg_get_function_identity_arguments(pr.oid) args from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
 where n.nspname='app_private' and pr.proname in ('subscription_for_company','lock_subscription','subscription_seats','reserve_company_seat','link_subscription_root','count_subscription_invoice','subscription_summary') loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 end loop;
end; $$;
commit;
