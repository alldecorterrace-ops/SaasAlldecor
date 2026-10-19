-- Owner-authorized changes preserve the subscription, companies, people and usage.
begin;
create table public.billing_plan_changes (
 id uuid primary key, order_id uuid not null references public.billing_orders(id),
 owner_id uuid not null references auth.users(id), subscription_id text not null,
 from_code text not null, to_code text not null, catalog_version text not null,
 direction text not null check(direction in ('upgrade','downgrade')),
 status text not null default 'quoted' check(status in ('quoted','processing','pending_payment','scheduled','applied','canceled')),
 quote jsonb, expires_at timestamptz not null default now()+interval '15 minutes',
 confirmed_at timestamptz, effective_at timestamptz, schedule_id text, invoice_id text,
 operation_id uuid, operation_until timestamptz,
 provider_started_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(catalog_version,from_code) references public.billing_plan_catalog(catalog_version,code),
 foreign key(catalog_version,to_code) references public.billing_plan_catalog(catalog_version,code),
 check(from_code<>to_code)
);
create unique index billing_plan_change_open on public.billing_plan_changes(order_id)
 where status in ('quoted','processing','pending_payment','scheduled');
alter table public.billing_plan_changes enable row level security;
revoke all on public.billing_plan_changes from public,anon,authenticated,service_role;
create trigger billing_plan_changes_audit after insert or update on public.billing_plan_changes
 for each row execute function app_private.platform_audit_change();

create function app_private.plan_change_offer(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(c)||jsonb_build_object('customer_id',o.customer_id,'mode',o.mode,'company_id',o.company_id,
 'completed_schedule_id',(select prior.schedule_id from public.billing_plan_changes prior
 where prior.order_id=o.id and prior.subscription_id=o.subscription_id and prior.status='applied'
 and prior.direction='downgrade' and prior.to_code=o.plan_code order by prior.updated_at desc limit 1))
 from public.billing_plan_changes c join public.billing_orders o on o.id=c.order_id where c.id=p_id;
$$;
create function public.prepare_company_plan_change(p_company uuid,p_id uuid,p_code text,p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; c public.billing_plan_changes; target public.billing_plan_catalog; amount integer;
begin
 select o1.* into o from public.billing_orders o1 join public.billing_company_links l on l.order_id=o1.id
 where l.company_id=p_company and o1.owner_id=auth.uid() for update of o1;
 if not found or not app_private.platform_access_allowed() or not exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id
 where m.company_id=p_company and m.user_id=auth.uid() and m.role='owner' and m.active and u.email_confirmed_at is not null)
 then raise exception 'permission_denied' using errcode='42501'; end if;
 if o.catalog_version<>'20261016' or o.mode is distinct from p_mode then raise exception 'billing_plan_change_unavailable'; end if;
 if not o.payment_verified or o.status<>'active' or o.paid_through<=now() or o.paid_through is null or o.cancel_at_period_end
 then raise exception 'billing_plan_change_inactive'; end if;
 update public.billing_plan_changes set status='canceled',updated_at=now() where order_id=o.id and status='quoted' and expires_at<=now();
 select * into c from public.billing_plan_changes where order_id=o.id and status in ('quoted','processing','pending_payment','scheduled');
 if found then
  if c.id=p_id and c.to_code=p_code then return app_private.plan_change_offer(c.id); end if;
  raise exception 'billing_plan_change_conflict';
 end if;
 select * into target from public.billing_plan_catalog where code=p_code and catalog_version=o.catalog_version;
 if not found or p_id is null or p_code=o.plan_code then raise exception 'invalid_billing_plan_change'; end if;
 if target.user_limit is not null and (select count(*) from app_private.subscription_seats(o.id))>target.user_limit
 then raise exception 'subscription_user_limit'; end if;
 if target.company_limit is not null and (select count(*) from public.billing_company_links where order_id=o.id)>target.company_limit
 then raise exception 'subscription_company_limit'; end if;
 select amount_cents into amount from public.billing_plan_catalog where code=o.plan_code and catalog_version=o.catalog_version;
 insert into public.billing_plan_changes(id,order_id,owner_id,subscription_id,from_code,to_code,catalog_version,direction)
 values(p_id,o.id,auth.uid(),o.subscription_id,o.plan_code,p_code,o.catalog_version,case when target.amount_cents>amount then 'upgrade' else 'downgrade' end);
 return app_private.plan_change_offer(p_id);
end; $$;

-- Serialize provider operations, including cancellation, across server requests.
-- A crashed request may be reconciled after the bounded five-minute lease.
create function public.lease_plan_change(p_id uuid,p_operation uuid,p_release boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_plan_changes; oid uuid;
begin
 select order_id into oid from public.billing_plan_changes where id=p_id;
 perform 1 from public.billing_orders where id=oid for update;
 select * into c from public.billing_plan_changes where id=p_id for update;
 if not found or p_operation is null then raise exception 'billing_plan_change_unavailable'; end if;
 if p_release then
  update public.billing_plan_changes set operation_id=null,operation_until=null where id=p_id and operation_id=p_operation;
 else
  if c.operation_until>now() and c.operation_id<>p_operation then raise exception 'billing_plan_operation_busy'; end if;
  update public.billing_plan_changes set operation_id=p_operation,operation_until=now()+interval '5 minutes' where id=p_id;
 end if;
end; $$;

create function public.start_plan_change_provider(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 select order_id into oid from public.billing_plan_changes where id=p_id;
 perform 1 from public.billing_orders where id=oid for update;
 update public.billing_plan_changes set provider_started_at=coalesce(provider_started_at,now())
 where id=p_id and status='processing' and confirmed_at is not null and operation_until>now();
 if not found then raise exception 'billing_plan_operation_busy'; end if;
end; $$;

create function public.attach_plan_change_quote(p_id uuid,p_quote jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_plan_changes; oid uuid;
begin
 select order_id into oid from public.billing_plan_changes where id=p_id;
 perform 1 from public.billing_orders where id=oid for update;
 select * into c from public.billing_plan_changes where id=p_id for update;
 if not found or c.status<>'quoted' or c.expires_at<=now() then raise exception 'billing_plan_change_conflict'; end if;
 if jsonb_typeof(p_quote)<>'object' or coalesce(p_quote->>'currency','')<>'usd'
 or coalesce(p_quote->>'item_id','') !~ '^si_[A-Za-z0-9_]+$'
 or (p_quote->>'due_cents')::bigint<0 or (p_quote->>'due_cents') is null
 or not (p_quote ?& array['period_start','period_end','proration_date'])
 or (p_quote->>'period_start') is null or (p_quote->>'period_end') is null or (p_quote->>'proration_date') is null
 or (p_quote->>'period_start')::bigint >= (p_quote->>'period_end')::bigint
 or to_timestamp((p_quote->>'period_end')::bigint)<=now()
 or to_timestamp((p_quote->>'proration_date')::bigint)>now()+interval '1 minute'
 or to_timestamp((p_quote->>'proration_date')::bigint)<now()-interval '15 minutes'
 then raise exception 'invalid_billing_plan_quote'; end if;
 if c.quote is not null and c.quote<>p_quote then raise exception 'billing_plan_quote_changed'; end if;
 update public.billing_plan_changes set quote=p_quote,effective_at=case when direction='downgrade' then to_timestamp((p_quote->>'period_end')::bigint) else null end,
 expires_at=least(expires_at,to_timestamp((p_quote->>'period_end')::bigint)),updated_at=now() where id=p_id;
end; $$;

create function public.company_plan_change(p_company uuid,p_id uuid,p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_plan_changes; o public.billing_orders; target public.billing_plan_catalog;
begin
 select o1.* into o from public.billing_orders o1 join public.billing_company_links l on l.order_id=o1.id
 where l.company_id=p_company and o1.owner_id=auth.uid() for update of o1;
 if not found or not app_private.platform_access_allowed() or not exists(select 1 from public.memberships
 where company_id=p_company and user_id=auth.uid() and role='owner' and active)
 then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into c from public.billing_plan_changes where id=p_id and order_id=o.id for update;
 if not found then raise exception 'billing_plan_change_unavailable'; end if;
 if p_confirm and c.status='quoted' then
  if c.quote is null or c.expires_at<=now() then raise exception 'billing_plan_quote_expired'; end if;
  if o.subscription_id<>c.subscription_id or o.plan_code<>c.from_code or o.catalog_version<>c.catalog_version
   or o.status<>'active' or not o.payment_verified or o.paid_through is null or o.paid_through<=now() or o.cancel_at_period_end
  then raise exception 'billing_plan_change_conflict'; end if;
  select * into target from public.billing_plan_catalog where code=c.to_code and catalog_version=c.catalog_version;
  if target.user_limit is not null and (select count(*) from app_private.subscription_seats(o.id))>target.user_limit
  then raise exception 'subscription_user_limit'; end if;
  if target.company_limit is not null and (select count(*) from public.billing_company_links where order_id=o.id)>target.company_limit
  then raise exception 'subscription_company_limit'; end if;
  update public.billing_plan_changes set status='processing',confirmed_at=now(),updated_at=now() where id=p_id;
 end if;
 return app_private.plan_change_offer(p_id);
end; $$;

-- Service updates record the provider result; they never directly change access.
create function public.record_plan_change_result(p_id uuid,p_status text,p_schedule text default null,p_invoice text default null) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_plan_changes; oid uuid;
begin
 select order_id into oid from public.billing_plan_changes where id=p_id;
 perform 1 from public.billing_orders where id=oid for update;
 select * into c from public.billing_plan_changes where id=p_id for update;
 if not found then raise exception 'billing_plan_change_unavailable'; end if;
 if c.status in ('applied','canceled') then return; end if;
 if p_status not in ('processing','pending_payment','scheduled','canceled')
 or (c.status='quoted' and p_status<>'canceled')
 or (p_schedule is not null and p_schedule !~ '^sub_sched_[A-Za-z0-9_]+$')
 or (p_invoice is not null and p_invoice !~ '^in_[A-Za-z0-9_]+$')
 then raise exception 'invalid_billing_plan_change'; end if;
 update public.billing_plan_changes set status=p_status,schedule_id=coalesce(p_schedule,schedule_id),invoice_id=coalesce(p_invoice,invoice_id),updated_at=now() where id=p_id;
end; $$;

-- Reserve the future seat/company capacity once a downgrade is confirmed. This
-- shares the same order lock as invitations, membership changes and new companies.
alter function app_private.reserve_company_seat(uuid,text) rename to reserve_company_seat_v095;
create function app_private.reserve_company_seat(p_company uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare oid uuid; maximum integer; person text;
begin
 oid:=app_private.lock_subscription(p_company);
 perform app_private.reserve_company_seat_v095(p_company,p_email);
 select p.user_limit into maximum from public.billing_plan_changes c join public.billing_plan_catalog p on p.code=c.to_code and p.catalog_version=c.catalog_version
 where c.order_id=oid and c.direction='downgrade' and c.status in ('processing','scheduled');
 if maximum is not null then
  person:=coalesce((select 'user:'||id::text from auth.users where lower(email)=lower(trim(p_email))),'email:'||lower(trim(p_email)));
  if (select count(*) from (select identity from app_private.subscription_seats(oid) union select person) s)>maximum
  then raise exception 'subscription_pending_user_limit'; end if;
 end if;
end; $$;
alter function public.create_subscription_company(uuid,uuid,text) rename to create_subscription_company_v095;
alter function public.create_subscription_company_v095(uuid,uuid,text) set schema app_private;
create function public.create_subscription_company(p_order uuid,p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare maximum integer;
begin
 perform 1 from public.billing_orders where id=p_order and owner_id=auth.uid() for update;
 if not found or not app_private.platform_access_allowed() then raise exception 'permission_denied' using errcode='42501'; end if;
 if not exists(select 1 from public.billing_company_links where company_id=p_id and order_id=p_order) then
  select p.company_limit into maximum from public.billing_plan_changes c join public.billing_plan_catalog p on p.code=c.to_code and p.catalog_version=c.catalog_version
  where c.order_id=p_order and c.direction='downgrade' and c.status in ('processing','scheduled');
  if maximum is not null and (select count(*) from public.billing_company_links where order_id=p_order)>=maximum
  then raise exception 'subscription_pending_company_limit'; end if;
 end if;
 return app_private.create_subscription_company_v095(p_order,p_id,p_name);
end; $$;

-- Keep the established webhook validation and reactivation behavior. Plan changes
-- additionally require an owner-confirmed request and provider-confirmed payment.
alter function public.apply_billing_snapshot(text,bigint,text,jsonb) rename to apply_billing_snapshot_v095;
alter function public.apply_billing_snapshot_v095(text,bigint,text,jsonb) set schema app_private;
create function public.apply_billing_snapshot(p_event text,p_created bigint,p_hash text,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; c public.billing_plan_changes; oid uuid:=(p_snapshot->>'order_id')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing-event:'||p_event,0));
 select * into o from public.billing_orders where id=oid for update;
 if o.subscription_id=p_snapshot->>'subscription_id' and not coalesce((p_snapshot->>'initial')::boolean,false)
 and o.plan_code is distinct from p_snapshot->>'plan_code' and p_created>=o.event_created
 and o.status not in ('canceled','incomplete_expired') and not exists(select 1 from public.billing_event_receipts where event_id=p_event) then
  select * into c from public.billing_plan_changes where order_id=oid and subscription_id=o.subscription_id
   and id::text=p_snapshot->>'plan_change_id' and to_code=p_snapshot->>'plan_code' and from_code=o.plan_code
   and catalog_version=o.catalog_version and catalog_version=p_snapshot->>'catalog_version'
   and status in ('processing','pending_payment','scheduled') for update;
  if not found then raise exception 'billing_plan_change_unverified'; end if;
  if p_snapshot->>'status'='active' and coalesce((p_snapshot->>'invoice_paid')::boolean,false)
   and not coalesce((p_snapshot->>'has_pending_update')::boolean,false)
   and to_timestamp((p_snapshot->>'invoice_created')::bigint)>=date_trunc('second',c.confirmed_at)
   and (c.direction='upgrade' or to_timestamp((p_snapshot->>'invoice_created')::bigint)>=c.effective_at)
   and (c.direction='upgrade' or (now()>=c.effective_at and (p_snapshot->>'paid_through')::timestamptz>c.effective_at)) then
   p_snapshot:=p_snapshot||jsonb_build_object('paid',true);
   update public.billing_plan_changes set status='applied',updated_at=now() where id=c.id;
  else
   -- Failed renewal cannot grant the lower plan or erase the previously paid period.
   p_snapshot:=p_snapshot||jsonb_build_object('plan_code',o.plan_code,'paid',false);
  end if;
 end if;
 perform app_private.apply_billing_snapshot_v095(p_event,p_created,p_hash,p_snapshot);
 -- A canceled subscription or a verified replacement retires its open requests.
 update public.billing_plan_changes pending_change set status='canceled',updated_at=now()
 from public.billing_orders current_order where current_order.id=oid and pending_change.order_id=oid
 and pending_change.status in ('quoted','processing','pending_payment','scheduled')
 and (current_order.status in ('canceled','incomplete_expired') or current_order.subscription_id<>pending_change.subscription_id);
end; $$;

alter function app_private.subscription_summary(uuid) rename to subscription_summary_v095;
create function app_private.subscription_summary(p_order uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select app_private.subscription_summary_v095(p_order)||jsonb_build_object('plan_change',
 (select jsonb_build_object('id',c.id,'plan_code',c.to_code,'plan',p.name,'amount_cents',p.amount_cents,
 'direction',c.direction,'status',c.status,'due_cents',(c.quote->>'due_cents')::bigint,
 'effective_at',c.effective_at,'expires_at',c.expires_at) from public.billing_plan_changes c
 join public.billing_plan_catalog p on p.code=c.to_code and p.catalog_version=c.catalog_version
 where c.order_id=p_order and c.status in ('quoted','processing','pending_payment','scheduled')));
$$;
revoke all on function public.prepare_company_plan_change(uuid,uuid,text,text),public.company_plan_change(uuid,uuid,boolean),public.create_subscription_company(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.prepare_company_plan_change(uuid,uuid,text,text),public.company_plan_change(uuid,uuid,boolean),public.create_subscription_company(uuid,uuid,text) to authenticated;
revoke all on function public.start_plan_change_provider(uuid),public.lease_plan_change(uuid,uuid,boolean),public.attach_plan_change_quote(uuid,jsonb),public.record_plan_change_result(uuid,text,text,text),public.apply_billing_snapshot(text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.start_plan_change_provider(uuid),public.lease_plan_change(uuid,uuid,boolean),public.attach_plan_change_quote(uuid,jsonb),public.record_plan_change_result(uuid,text,text,text),public.apply_billing_snapshot(text,bigint,text,jsonb) to service_role;
revoke all on function app_private.plan_change_offer(uuid),app_private.reserve_company_seat(uuid,text),app_private.reserve_company_seat_v095(uuid,text),
 app_private.create_subscription_company_v095(uuid,uuid,text),app_private.apply_billing_snapshot_v095(text,bigint,text,jsonb),app_private.subscription_summary(uuid),app_private.subscription_summary_v095(uuid)
 from public,anon,authenticated,service_role;
commit;
