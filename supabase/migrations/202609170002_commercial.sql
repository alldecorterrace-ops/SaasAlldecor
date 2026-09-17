-- Leads and configurable products. Additive; no legacy import or data deletion.
begin;
create table public.leads (
 id uuid primary key, company_id uuid not null references public.companies(id),
 full_name text not null check(length(trim(full_name)) between 2 and 255),
 email text not null default '' check(length(email)<=254), phone text not null default '' check(length(phone)<=64),
 address text not null default '' check(length(address)<=255), city text not null default '' check(length(city)<=128),
 postal_code text not null default '' check(length(postal_code)<=24), service text not null default '' check(length(service)<=255),
 message text not null default '' check(length(message)<=10000),
 contact_preference text not null default '' check(length(contact_preference)<=60),
 appointment_date date, lead_date date not null default current_date,
 source text not null default 'panel' check(length(source) between 1 and 120),
 status text not null default 'NUEVO' check(status in ('NUEVO','CONTACTADO','COTIZANDO','GANADO','PERDIDO','CLIENTE','DESCARTADO','FUERA_AREA')),
 archived boolean not null default false,
 customer_id uuid, version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,customer_id) references public.customers(company_id,id),
 check ((customer_id is not null) = (status='CLIENTE'))
);
create index leads_company_date on public.leads(company_id,archived,lead_date desc,id);
create index leads_company_status on public.leads(company_id,status);

create function app_private.valid_product_details(specs jsonb, options jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare s jsonb; g jsonb; c jsonb;
begin
 if specs is null or options is null or jsonb_typeof(specs)<>'array' or jsonb_typeof(options)<>'array' then return false; end if;
 if jsonb_array_length(specs)>30 or jsonb_array_length(options)>20 or octet_length(specs::text)+octet_length(options::text)>100000 then return false; end if;
 for s in select value from jsonb_array_elements(specs) loop
   if jsonb_typeof(s)<>'object' or jsonb_typeof(s->'label') is distinct from 'string' or length(trim(s->>'label')) not between 1 and 120
     or jsonb_typeof(s->'unit') is distinct from 'string' or length(s->>'unit')>24 then return false; end if;
 end loop;
 for g in select value from jsonb_array_elements(options) loop
   if jsonb_typeof(g)<>'object' or jsonb_typeof(g->'label') is distinct from 'string' or length(trim(g->>'label')) not between 1 and 120
     or jsonb_typeof(g->'choices') is distinct from 'array' then return false; end if;
   if jsonb_array_length(g->'choices') not between 1 and 30 then return false; end if;
   for c in select value from jsonb_array_elements(g->'choices') loop
     if jsonb_typeof(c)<>'object' or jsonb_typeof(c->'label') is distinct from 'string' or length(trim(c->>'label')) not between 1 and 120
       or c->>'addType' is null or c->>'addType' not in ('base','flat','percent') or coalesce(c->>'add','') !~ '^-?[0-9]{1,9}(\.[0-9]{1,2})?$' then return false; end if;
   end loop;
 end loop;
 return true;
end; $$;
revoke all on function app_private.valid_product_details(jsonb,jsonb) from public;

create table public.products (
 id uuid primary key, company_id uuid not null references public.companies(id),
 name text not null check(length(trim(name)) between 2 and 255), category text not null check(length(trim(category)) between 1 and 128),
 base text not null check(base in ('area_ft2','linear_ft','volume_ft3','unit','fixed','manual')),
 unit_price numeric(14,2) not null check(unit_price>=0 and unit_price<=999999999.99),
 currency text not null default 'USD' check(currency='USD'),
 specs jsonb not null default '[]', options jsonb not null default '[]',
 active boolean not null default true, version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), check(app_private.valid_product_details(specs,options))
);
create index products_company_name on public.products(company_id,active,name,id);
alter table public.leads enable row level security;
alter table public.products enable row level security;
revoke all on public.leads,public.products from anon,authenticated;
grant select on public.leads,public.products to authenticated;
create policy leads_read on public.leads for select to authenticated using(app_private.can_access(company_id,'crm','read'));
create policy products_read on public.products for select to authenticated using(app_private.can_access(company_id,'productos','read'));
create trigger leads_audit after insert or update on public.leads for each row execute function app_private.audit_change();
create trigger products_audit after insert or update on public.products for each row execute function app_private.audit_change();

create function public.save_lead(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.leads; r public.leads;
begin
 if not app_private.can_access(p_company,'crm','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_lead'; end if;
 select * into r from jsonb_populate_record(null::public.leads,p_data);
 if p_version>0 then
   select * into oldrow from public.leads where company_id=p_company and id=p_id for update;
   if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='40001'; end if;
 end if;
 if (r.status='CLIENTE' and oldrow.customer_id is null) or (oldrow.customer_id is not null and r.status<>'CLIENTE') then raise exception 'use_lead_conversion'; end if;
 if p_version=0 then
   insert into public.leads(id,company_id,full_name,email,phone,address,city,postal_code,service,message,contact_preference,appointment_date,lead_date,source,status,archived,created_by,updated_by)
   values(p_id,p_company,trim(r.full_name),r.email,r.phone,r.address,r.city,r.postal_code,r.service,r.message,r.contact_preference,r.appointment_date,r.lead_date,r.source,r.status,r.archived,auth.uid(),auth.uid());
 else
   update public.leads set full_name=trim(r.full_name),email=r.email,phone=r.phone,address=r.address,city=r.city,postal_code=r.postal_code,service=r.service,message=r.message,
     contact_preference=r.contact_preference,appointment_date=r.appointment_date,lead_date=r.lead_date,source=r.source,status=r.status,archived=r.archived,version=version+1,updated_by=auth.uid(),updated_at=now()
   where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $$;

create function public.convert_lead(p_company uuid,p_lead uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.leads; cid uuid;
begin
 if not app_private.can_access(p_company,'crm','write') or not app_private.can_access(p_company,'clientes','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into r from public.leads where company_id=p_company and id=p_lead for update;
 if not found then raise exception 'record_not_found'; end if;
 if r.customer_id is not null then return r.customer_id; end if;
 if p_version is null or r.version<>p_version then raise exception 'record_conflict' using errcode='40001'; end if;
 if r.archived then raise exception 'lead_archived'; end if;
 cid:=gen_random_uuid();
 insert into public.customers(id,company_id,full_name,email,phone,address,city,postal_code,service,client_date,notes,created_by,updated_by)
 values(cid,p_company,r.full_name,r.email,r.phone,r.address,r.city,r.postal_code,r.service,
   (now() at time zone (select timezone from public.companies where id=p_company))::date,r.message,auth.uid(),auth.uid());
 update public.leads set customer_id=cid,status='CLIENTE',version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_lead;
 return cid;
end; $$;

create function public.save_product(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldversion integer; r public.products;
begin
 if not app_private.can_access(p_company,'productos','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_product'; end if;
 -- Reject excess precision before a numeric column can round it silently.
 if coalesce(p_data->>'unit_price','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_price'; end if;
 select * into r from jsonb_populate_record(null::public.products,p_data);
 if p_version=0 then
   insert into public.products(id,company_id,name,category,base,unit_price,specs,options,active,created_by,updated_by)
   values(p_id,p_company,trim(r.name),trim(r.category),r.base,r.unit_price,r.specs,r.options,r.active,auth.uid(),auth.uid());
 else
   select version into oldversion from public.products where company_id=p_company and id=p_id for update;
   if not found or oldversion<>p_version then raise exception 'record_conflict' using errcode='40001'; end if;
   update public.products set name=trim(r.name),category=trim(r.category),base=r.base,unit_price=r.unit_price,specs=r.specs,options=r.options,active=r.active,
     version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $$;

-- Safe audit timeline: no raw snapshots or private data from other modules.
create function public.activity_feed(p_company uuid,p_before bigint default null) returns table(id bigint,entity text,entity_id text,operation text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'activity','read') then raise exception 'permission_denied' using errcode='42501'; end if;
 return query select a.id,a.entity,a.entity_id,a.operation,a.created_at from public.audit_events a
 where a.company_id=p_company and (p_before is null or a.id<p_before)
   and (app_private.is_manager(p_company) or case a.entity
     when 'customers' then app_private.can_access(p_company,'clientes','read')
     when 'leads' then app_private.can_access(p_company,'crm','read')
     when 'products' then app_private.can_access(p_company,'productos','read')
     else false end)
 order by a.id desc limit 50;
end; $$;
revoke all on function public.save_lead(uuid,uuid,integer,jsonb),public.convert_lead(uuid,uuid,integer),public.save_product(uuid,uuid,integer,jsonb),public.activity_feed(uuid,bigint) from public,anon;
grant execute on function public.save_lead(uuid,uuid,integer,jsonb),public.convert_lead(uuid,uuid,integer),public.save_product(uuid,uuid,integer,jsonb),public.activity_feed(uuid,bigint) to authenticated;
commit;
