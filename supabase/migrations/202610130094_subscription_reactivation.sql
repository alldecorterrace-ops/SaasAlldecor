-- Reactivation preserves the company, payer, members, provider customer and receipts.
-- The current billing row stays the one authoritative subscription for its company.
begin;
create table public.billing_reactivations (
 id uuid primary key, order_id uuid not null references public.billing_orders(id),
 company_id uuid not null references public.companies(id), owner_id uuid not null references auth.users(id),
 email text not null, plan_code text not null references public.billing_plans(code),
 mode text not null check(mode in ('test','live')), customer_id text not null,
 previous_subscription_id text not null, checkout_id text unique, checkout_expires_at timestamptz,
 subscription_id text unique, checkout_verified boolean not null default false,
 status text not null default 'pending' check(status in ('pending','activated','expired')),
 previous_snapshot jsonb, activated_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((status='activated')=(previous_snapshot is not null and activated_at is not null))
);
create unique index billing_reactivation_pending on public.billing_reactivations(order_id) where status='pending';
create index billing_reactivation_previous on public.billing_reactivations(order_id,previous_subscription_id) where status='activated';
alter table public.billing_reactivations enable row level security;
revoke all on public.billing_reactivations from public,anon,authenticated,service_role;
grant select on public.billing_reactivations to service_role;
create policy billing_reactivation_service_read on public.billing_reactivations for select to service_role using(true);
create trigger billing_reactivations_audit after insert or update on public.billing_reactivations
 for each row execute function app_private.platform_audit_change();

create function app_private.reactivation_offer(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'order_id',r.order_id,'email',r.email,'plan_code',r.plan_code,
 'mode',r.mode,'customer_id',r.customer_id,'checkout_id',r.checkout_id)
 from public.billing_reactivations r where r.id=p_id;
$$;
revoke all on function app_private.reactivation_offer(uuid) from public,anon,authenticated,service_role;

create function public.prepare_company_reactivation(p_company uuid,p_id uuid,p_code text,p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; r public.billing_reactivations; address text; maximum integer; seats bigint;
begin
 if auth.uid() is null or not app_private.platform_access_allowed() then raise exception 'permission_denied' using errcode='42501'; end if;
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select b.* into o from public.billing_orders b join public.memberships m on m.company_id=b.company_id and m.user_id=b.owner_id
 where b.company_id=p_company and b.owner_id=auth.uid() and m.active and m.role='owner' for update of b;
 if not found or address is null then raise exception 'permission_denied' using errcode='42501'; end if;
 if o.email is distinct from address then raise exception 'billing_owner_email_changed'; end if;
 if o.status not in ('canceled','incomplete_expired') then raise exception 'billing_reactivation_not_needed'; end if;
 if p_id is null or p_mode is distinct from o.mode or o.customer_id is null or o.subscription_id is null
 then raise exception 'invalid_billing_reactivation'; end if;
 select user_limit into maximum from public.billing_plans where code=p_code and active;
 if maximum is null then raise exception 'invalid_billing_reactivation'; end if;
 select (select count(*) from public.memberships where company_id=p_company and active)
 +(select count(*) from public.company_invitations where company_id=p_company and status='pending' and expires_at>now()) into seats;
 if seats>maximum then raise exception 'subscription_user_limit'; end if;
 select * into r from public.billing_reactivations where order_id=o.id and status='pending' for update;
 if found then
  if r.plan_code is distinct from p_code or r.mode is distinct from p_mode or r.owner_id is distinct from auth.uid()
  or r.previous_subscription_id is distinct from o.subscription_id then raise exception 'billing_reactivation_conflict'; end if;
  return app_private.reactivation_offer(r.id);
 end if;
 if exists(select 1 from public.billing_reactivations where id=p_id) then raise exception 'billing_reactivation_conflict'; end if;
 insert into public.billing_reactivations(id,order_id,company_id,owner_id,email,plan_code,mode,customer_id,previous_subscription_id)
 values(p_id,o.id,p_company,auth.uid(),address,p_code,p_mode,o.customer_id,o.subscription_id);
 return app_private.reactivation_offer(p_id);
end; $$;
revoke all on function public.prepare_company_reactivation(uuid,uuid,text,text) from public,anon,service_role;
grant execute on function public.prepare_company_reactivation(uuid,uuid,text,text) to authenticated;

create function public.attach_reactivation_checkout(p_id uuid,p_checkout text,p_expires_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 if p_checkout is null or p_checkout !~ '^cs_[a-zA-Z0-9_]+$' or p_expires_at is null then raise exception 'invalid_checkout'; end if;
 select order_id into oid from public.billing_reactivations where id=p_id;
 perform 1 from public.billing_orders where id=oid for update;
 if exists(select 1 from public.billing_reactivations where id=p_id and status='activated' and checkout_id=p_checkout) then return; end if;
 update public.billing_reactivations set checkout_id=p_checkout,checkout_expires_at=p_expires_at,updated_at=now()
 where id=p_id and status='pending' and (checkout_id is null or checkout_id=p_checkout);
 if not found then raise exception 'billing_reactivation_conflict'; end if;
end; $$;
-- The server calls this only after Stripe confirms an unpaid Checkout is expired.
create function public.expire_reactivation_checkout(p_id uuid,p_checkout text) returns void
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 select order_id into oid from public.billing_reactivations where id=p_id;
 perform 1 from public.billing_orders where id=oid for update;
 if exists(select 1 from public.billing_reactivations where id=p_id and status='expired' and checkout_id=p_checkout) then return; end if;
 update public.billing_reactivations set status='expired',updated_at=now()
 where id=p_id and checkout_id=p_checkout and status='pending' and not checkout_verified;
 if not found then raise exception 'billing_reactivation_conflict'; end if;
end; $$;
revoke all on function public.attach_reactivation_checkout(uuid,text,timestamptz),public.expire_reactivation_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.attach_reactivation_checkout(uuid,text,timestamptz),public.expire_reactivation_checkout(uuid,text) to service_role;

create function app_private.protect_reactivation_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' or (OLD.status='activated' and to_jsonb(NEW) is distinct from to_jsonb(OLD))
 then raise exception 'billing_history_protected'; end if;
 return NEW;
end; $$;
revoke all on function app_private.protect_reactivation_history() from public,anon,authenticated,service_role;
create trigger billing_reactivation_history_guard before update or delete on public.billing_reactivations
 for each row execute function app_private.protect_reactivation_history();

create or replace function public.apply_billing_snapshot(p_event text,p_created bigint,p_hash text,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare old public.billing_orders; receipt public.billing_event_receipts; r public.billing_reactivations;
 oid uuid:=(p_snapshot->>'order_id')::uuid; rid uuid:=nullif(p_snapshot->>'reactivation_id','')::uuid;
 code text:=p_snapshot->>'plan_code'; current_status text:=p_snapshot->>'status';
 initial boolean:=coalesce((p_snapshot->>'initial')::boolean,false); seats bigint; maximum integer;
begin
 if p_event is null or p_event !~ '^evt_[a-zA-Z0-9_]+$' or p_created is null or p_created<1
 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
 or code is null or not exists(select 1 from public.billing_plans where billing_plans.code=(p_snapshot->>'plan_code') and active)
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
  if not found or r.status='expired' or r.mode is distinct from old.mode or r.customer_id is distinct from p_snapshot->>'customer_id'
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
    select user_limit into maximum from public.billing_plans where billing_plans.code=(p_snapshot->>'plan_code') and active;
    select (select count(*) from public.memberships where company_id=old.company_id and active)
    +(select count(*) from public.company_invitations where company_id=old.company_id and status='pending' and expires_at>now()) into seats;
    if seats>maximum then raise exception 'subscription_user_limit'; end if;
    update public.billing_reactivations set status='activated',previous_snapshot=to_jsonb(old),activated_at=now(),updated_at=now() where id=rid;
    update public.billing_orders set plan_code=code,checkout_id=r.checkout_id,subscription_id=p_snapshot->>'subscription_id',
    status=current_status,payment_verified=true,paid_through=(p_snapshot->>'paid_through')::timestamptz,
    cancel_at_period_end=coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),event_created=p_created,updated_at=now() where id=oid;
   end if;
   insert into public.billing_event_receipts(event_id,body_hash,order_id) values(p_event,p_hash,oid);
   return;
  end if;
  if r.subscription_id is distinct from old.subscription_id or r.subscription_id is distinct from p_snapshot->>'subscription_id'
  then raise exception 'billing_reactivation_mismatch'; end if;
 end if;
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

create or replace function public.company_subscription_summary(p_company uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',p.name,'plan_code',p.code,'amount_cents',p.amount_cents,'user_limit',p.user_limit,
 'status',o.status,'paid_through',o.paid_through,'mode',o.mode,'cancel_at_period_end',o.cancel_at_period_end,
 'active_users',(select count(*) from public.memberships where company_id=p_company and active),
 'pending_invitations',(select count(*) from public.company_invitations where company_id=p_company and status='pending' and expires_at>now()),
 'writable',app_private.billing_writable(p_company),
 'can_reactivate',o.owner_id=auth.uid() and o.status in ('canceled','incomplete_expired'),
 'reactivation_plan',(select r.plan_code from public.billing_reactivations r where r.order_id=o.id and r.status='pending'))
 from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.company_id=p_company and app_private.is_manager(p_company);
$$;
commit;
