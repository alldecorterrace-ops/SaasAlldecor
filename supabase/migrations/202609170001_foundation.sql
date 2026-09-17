-- Additive foundation. Run as one transaction on the selected empty SaaS project.
-- Auth is provided by Supabase. No ADT data is imported by this migration.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.module_catalog (
  id text primary key, label text not null, sort_order integer not null unique
);
insert into public.module_catalog values
('dashboard','Dashboard',1),('crm','Leads',2),('clientes','Clientes',3),
('nuevo3d','Nuevo estimado 3D',4),('productos','Productos',5),('pergolamotor','Pérgola sin 3D',6),
('estimadosweb','Estimados web',7),('adm-precios','Precios',8),('fin-estimados','Estimados',9),
('fin-invoices','Invoices',10),('fin-proyectos','Proyectos',11),('horasfix','Horas y solicitudes',12),
('manualfab','Manual de fabricación',13),('permisos','Permisos',14),('inventario','Inventario',15),
('gastos','Gastos',16),('trabajadores','Trabajadores',17),('mapazonas','Mapa de zonas',18),
('instalaciones','Instalaciones',19),('portal','Portal del cliente',20),('ia','IA Assistant',21),
('activity','Actividad',22),('config','Configuración',23);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  timezone text not null default 'America/New_York',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.memberships (
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id),
  email text not null,
  role text not null check (role in ('owner','admin','member')),
  active boolean not null default true,
  permissions jsonb not null default '{"dashboard":["read"],"clientes":["read"]}',
  created_at timestamptz not null default now(),
  primary key (company_id,user_id)
);
create index memberships_user on public.memberships(user_id,company_id) where active;
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  full_name text not null check (length(trim(full_name)) between 2 and 255),
  email text check (length(email)<=254), phone text check (length(phone)<=64),
  address text check (length(address)<=255), city text check (length(city)<=128),
  postal_code text check (length(postal_code)<=24), service text check (length(service)<=255),
  client_date date not null default current_date, notes text check (length(notes)<=10000),
  status text not null default 'active' check(status in ('active','archived')),
  version integer not null default 1 check(version>0),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id)
);
create index customers_company_name on public.customers(company_id,full_name,id);
create index customers_company_status on public.customers(company_id,status);
create table public.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id), actor_id uuid references auth.users(id),
  entity text not null, entity_id text not null, operation text not null,
  before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index audit_company_created on public.audit_events(company_id,created_at desc);

create function app_private.is_member(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=(select auth.uid()) and m.active);
$$;
create function app_private.is_manager(p_company uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','admin'));
$$;
create function app_private.can_access(p_company uuid,p_module text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.company_id=p_company and m.user_id=(select auth.uid()) and m.active
    and (m.role in ('owner','admin') or coalesce(m.permissions->p_module ? p_action,false)
      or (p_action='read' and coalesce(m.permissions->p_module ? 'write',false))));
$$;
revoke all on function app_private.is_member(uuid), app_private.is_manager(uuid), app_private.can_access(uuid,text,text) from public;
grant execute on function app_private.is_member(uuid), app_private.is_manager(uuid), app_private.can_access(uuid,text,text) to authenticated;

alter table public.module_catalog enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.module_catalog,public.companies,public.memberships,public.customers,public.audit_events from anon,authenticated;
grant select on public.module_catalog,public.companies,public.memberships,public.customers,public.audit_events to authenticated;
create policy catalog_read on public.module_catalog for select to authenticated using(true);
create policy company_read on public.companies for select to authenticated using(app_private.is_member(id));
create policy membership_read on public.memberships for select to authenticated
  using(app_private.is_member(company_id) and (user_id=(select auth.uid()) or app_private.is_manager(company_id)));
create policy customer_read on public.customers for select to authenticated using(app_private.can_access(company_id,'clientes','read'));
-- Audit snapshots are restricted to company managers, even when a member can view Activity.
create policy audit_read on public.audit_events for select to authenticated using(app_private.is_manager(company_id));

create function app_private.audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid; eid text;
begin
  if TG_TABLE_NAME='companies' then cid:=NEW.id; eid:=NEW.id::text;
  elsif TG_TABLE_NAME='memberships' then cid:=NEW.company_id; eid:=NEW.user_id::text;
  else cid:=NEW.company_id; eid:=NEW.id::text; end if;
  insert into public.audit_events(company_id,actor_id,entity,entity_id,operation,before_data,after_data)
  values(cid,auth.uid(),TG_TABLE_NAME,eid,TG_OP,case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW));
  return NEW;
end; $$;
revoke all on function app_private.audit_change() from public;
create trigger companies_audit after insert or update on public.companies for each row execute function app_private.audit_change();
create trigger memberships_audit after insert or update on public.memberships for each row execute function app_private.audit_change();
create trigger customers_audit after insert or update on public.customers for each row execute function app_private.audit_change();

create function public.create_company(p_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.companies;
begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'authentication_required' using errcode='42501'; end if;
  if p_id is null or p_name is null or length(trim(p_name)) not between 2 and 160 then raise exception 'invalid_company'; end if;
  -- Serialize retries for the same request identifier.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into existing from public.companies where id=p_id;
  if found then
    if existing.created_by=uid and existing.name=trim(p_name) and app_private.is_manager(p_id) then return p_id; end if;
    raise exception 'request_conflict' using errcode='23505';
  end if;
  insert into public.companies(id,name,created_by) values(p_id,trim(p_name),uid);
  insert into public.memberships(company_id,user_id,email,role,permissions)
    values(p_id,uid,(select email from auth.users where id=uid),'owner','{}');
  return p_id;
end; $$;

create function public.save_customer(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n text:=trim(p_data->>'full_name'); wanted_status text:=coalesce(p_data->>'status','active'); affected integer;
begin
  if not app_private.can_access(p_company,'clientes','write') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object'
    or n is null or length(n) not between 2 and 255 or wanted_status not in ('active','archived') then raise exception 'invalid_customer'; end if;
  if p_version=0 then
    insert into public.customers(id,company_id,full_name,email,phone,address,city,postal_code,service,client_date,notes,status,created_by,updated_by)
    values(p_id,p_company,n,nullif(trim(p_data->>'email'),''),nullif(trim(p_data->>'phone'),''),nullif(trim(p_data->>'address'),''),
      nullif(trim(p_data->>'city'),''),nullif(trim(p_data->>'postal_code'),''),nullif(trim(p_data->>'service'),''),
      coalesce(nullif(p_data->>'client_date','')::date,current_date),nullif(p_data->>'notes',''),wanted_status,uid,uid);
  else
    update public.customers set full_name=n,email=nullif(trim(p_data->>'email'),''),phone=nullif(trim(p_data->>'phone'),''),
      address=nullif(trim(p_data->>'address'),''),city=nullif(trim(p_data->>'city'),''),postal_code=nullif(trim(p_data->>'postal_code'),''),
      service=nullif(trim(p_data->>'service'),''),client_date=coalesce(nullif(p_data->>'client_date','')::date,client_date),
      notes=nullif(p_data->>'notes',''),status=wanted_status,version=version+1,updated_by=uid,updated_at=now()
    where company_id=p_company and id=p_id and version=p_version;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'customer_conflict' using errcode='40001'; end if;
  end if;
  return p_id;
end; $$;

create function public.update_company(p_company uuid,p_name text,p_timezone text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not app_private.can_access(p_company,'config','write') then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 160 or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid_company'; end if;
  update public.companies set name=trim(p_name),timezone=p_timezone,updated_at=now() where id=p_company;
end; $$;

create function public.add_company_member(p_company uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if target is null then raise exception 'account_not_available'; end if;
  insert into public.memberships(company_id,user_id,email,role)
    values(p_company,target,(select email from auth.users where id=target),'member') on conflict do nothing;
end; $$;

create function public.set_member_access(p_company uuid,p_user uuid,p_role text,p_active boolean,p_permissions jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor_role text; target_role text; entry record; item jsonb;
begin
  select role into actor_role from public.memberships where company_id=p_company and user_id=auth.uid() and active;
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

revoke all on function public.create_company(uuid,text),public.save_customer(uuid,uuid,integer,jsonb),
  public.update_company(uuid,text,text),public.add_company_member(uuid,text),public.set_member_access(uuid,uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.create_company(uuid,text),public.save_customer(uuid,uuid,integer,jsonb),
  public.update_company(uuid,text,text),public.add_company_member(uuid,text),public.set_member_access(uuid,uuid,text,boolean,jsonb) to authenticated;

comment on table public.customers is 'SaaS customers. Legacy data requires an explicit audited import; no ADT import has run.';
commit;
