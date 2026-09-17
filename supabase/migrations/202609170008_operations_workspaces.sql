begin;
create function app_private.work_module(p_kind text) returns text language sql immutable set search_path='' as $$
 select case p_kind when 'permits' then 'permisos' when 'inventory' then 'inventario' when 'installations' then 'instalaciones' when 'manuals' then 'manualfab' when 'zones' then 'mapazonas' end;
$$;
revoke all on function app_private.work_module(text) from public;
grant execute on function app_private.work_module(text) to authenticated;

create table public.work_records (
 id uuid primary key, company_id uuid not null references public.companies(id),
 kind text not null check(kind in ('permits','inventory','installations','manuals','zones')),
 name text not null check(length(trim(name)) between 2 and 190), status text not null,
 project_id uuid, worker_id uuid, data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<=60000),
 stock numeric(15,3) not null default 0 check(stock>=0), version integer not null default 1,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,project_id) references public.projects(company_id,id), foreign key(company_id,worker_id) references public.workers(company_id,id),
 check((kind='inventory' and status in ('ACTIVO','ARCHIVADO')) or (kind='permits' and status in ('PENDIENTE','EN_REVISION','APROBADO','RECHAZADO','VENCIDO','ANULADO')) or (kind='manuals' and status in ('BORRADOR','EN_REVISION','APROBADO','ARCHIVADO')) or (kind='installations' and status in ('PROGRAMADA','EN_CURSO','COMPLETADA','CANCELADA')) or (kind='zones' and status in ('ACTIVA','INACTIVA')))
);
create index work_records_list on public.work_records(company_id,kind,updated_at desc,id);
create unique index inventory_sku on public.work_records(company_id,lower(data->>'sku')) where kind='inventory' and coalesce(data->>'sku','')<>'';
create table public.inventory_movements (
 id uuid primary key,company_id uuid not null,item_id uuid not null, project_id uuid,
 movement_date date not null, quantity numeric(15,3) not null check(quantity<>0),
 reason text not null check(length(trim(reason)) between 3 and 2000),reference text not null default '' check(length(reference)<=100),
 reversal_of uuid unique, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,item_id) references public.work_records(company_id,id),
 foreign key(company_id,project_id) references public.projects(company_id,id),foreign key(company_id,reversal_of) references public.inventory_movements(company_id,id)
);
create index inventory_movements_list on public.inventory_movements(company_id,item_id,created_at desc,id);
create unique index inventory_reference on public.inventory_movements(company_id,item_id,reference) where reference<>'' and reversal_of is null;
alter table public.work_records enable row level security;
alter table public.inventory_movements enable row level security;
revoke all on public.work_records,public.inventory_movements from public,anon,authenticated;
grant select on public.work_records,public.inventory_movements to authenticated;
create policy work_read on public.work_records for select to authenticated using(app_private.can_access(company_id,app_private.work_module(kind),'read'));
create policy inventory_read on public.inventory_movements for select to authenticated using(app_private.can_access(company_id,'inventario','read'));
create trigger work_records_audit after insert or update on public.work_records for each row execute function app_private.audit_change();
create trigger inventory_movements_audit after insert on public.inventory_movements for each row execute function app_private.audit_change();

create function public.save_work_record(p_company uuid,p_id uuid,p_version integer,p_kind text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.work_records; nm text;st text;proj uuid;worker uuid;d jsonb;changed boolean;ts timestamptz;te timestamptz;
begin
 if app_private.work_module(p_kind) is null or not app_private.can_access(p_company,app_private.work_module(p_kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>65000 then raise exception 'invalid_record';end if;
 -- Serialize schedule validation within a company, including changing the assigned worker.
 if p_kind='installations' then perform pg_advisory_xact_lock(hashtextextended(p_company::text||':installations',0));end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then
  select * into oldrow from public.work_records where company_id=p_company and id=p_id and kind=p_kind for update;
  if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 end if;
 nm:=trim(p_data->>'name');st:=p_data->>'status';proj:=nullif(p_data->>'project_id','')::uuid;worker:=nullif(p_data->>'worker_id','')::uuid;d:=p_data->'data';
 if nm is null or length(nm) not between 2 and 190 or st is null or d is null or jsonb_typeof(d)<>'object' or length(coalesce(d->>'notes',''))>10000 then raise exception 'invalid_record';end if;
 if p_kind in ('permits','manuals','installations') and proj is null then raise exception 'project_required';end if;
 if proj is not null and (p_version=0 or proj is distinct from oldrow.project_id) and (not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=proj)) then raise exception 'project_unavailable';end if;
 if worker is not null and (p_version=0 or worker is distinct from oldrow.worker_id) and (not app_private.can_access(p_company,'trabajadores','read') or not exists(select 1 from public.workers where company_id=p_company and id=worker and active)) then raise exception 'worker_unavailable';end if;
 if p_kind='permits' then
  if coalesce(d->>'fee','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or length(coalesce(d->>'authority',''))>190 or length(coalesce(d->>'permit_number',''))>100 then raise exception 'invalid_permit';end if;
  perform nullif(d->>'submitted_date','')::date,nullif(d->>'approved_date','')::date,nullif(d->>'expiration_date','')::date;
  if nullif(d->>'approved_date','')::date<nullif(d->>'submitted_date','')::date or nullif(d->>'expiration_date','')::date<nullif(d->>'approved_date','')::date then raise exception 'invalid_dates';end if;
  if st='APROBADO' and (nullif(d->>'approved_date','') is null or nullif(trim(d->>'permit_number'),'') is null) then raise exception 'approval_fields_required';end if;
  if st in ('ANULADO','RECHAZADO') and length(trim(coalesce(d->>'notes','')))<3 then raise exception 'reason_required';end if;
 elsif p_kind='inventory' then
  if length(coalesce(d->>'sku',''))>100 or length(trim(coalesce(d->>'unit',''))) not between 1 and 32 or length(coalesce(d->>'location',''))>190 or coalesce(d->>'minimum','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' or coalesce(d->>'unit_cost','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_item';end if;
  if p_version>0 and oldrow.stock<>0 and d->>'unit' is distinct from oldrow.data->>'unit' then raise exception 'unit_locked';end if;
 elsif p_kind='installations' then
  ts:=(d->>'starts_at')::timestamptz;te:=(d->>'ends_at')::timestamptz;
  if ts is null or te is null or te<=ts or te-ts>interval '7 days' or worker is null or length(coalesce(d->>'address',''))>500 or length(coalesce(d->>'crew',''))>2000 then raise exception 'invalid_schedule';end if;
  if st<>'CANCELADA' and exists(select 1 from public.work_records w where w.company_id=p_company and w.kind='installations' and w.worker_id=worker and w.id<>p_id and w.status<>'CANCELADA' and (w.data->>'starts_at')::timestamptz<te and (w.data->>'ends_at')::timestamptz>ts) then raise exception 'schedule_overlap';end if;
  if st in ('EN_CURSO','COMPLETADA') and (p_version=0 or st is distinct from oldrow.status or proj is distinct from oldrow.project_id) then
   perform 1 from public.invoices where company_id=p_company and project_id=proj for update;
   if not exists(select 1 from public.invoices where company_id=p_company and project_id=proj and status='OPEN' and paid_amount>0) then raise exception 'deposit_required';end if;
  end if;
  if st='CANCELADA' and length(trim(coalesce(d->>'notes','')))<3 then raise exception 'reason_required';end if;
 elsif p_kind='manuals' then
  if length(coalesce(d->>'measurements',''))>10000 or length(coalesce(d->>'materials',''))>10000 or length(coalesce(d->>'steps',''))>20000 or length(coalesce(d->>'review_note',''))>2000 then raise exception 'invalid_manual';end if;
  changed:=p_version>0 and (nm,proj,d-'review_note'-'notes') is distinct from (oldrow.name,oldrow.project_id,oldrow.data-'review_note'-'notes');
  if not app_private.is_manager(p_company) and ((st='APROBADO' and (p_version=0 or st<>oldrow.status)) or (p_version>0 and oldrow.status='ARCHIVADO')) then raise exception 'manager_required' using errcode='42501';end if;
  if changed and oldrow.status='APROBADO' then st:='EN_REVISION';d:=jsonb_set(d,'{review_note}','"Contenido corregido; requiere nueva revisión."');end if;
  if st='APROBADO' and length(trim(coalesce(d->>'steps','')))<3 then raise exception 'steps_required';end if;
 elsif p_kind='zones' then
  if coalesce(d->>'latitude','') !~ '^-?[0-9]{1,3}(\.[0-9]{1,7})?$' or coalesce(d->>'longitude','') !~ '^-?[0-9]{1,3}(\.[0-9]{1,7})?$' or coalesce(d->>'radius_m','') !~ '^[0-9]{1,7}$' then raise exception 'invalid_zone';end if;
  if (d->>'latitude')::numeric not between -90 and 90 or (d->>'longitude')::numeric not between -180 and 180 or (d->>'radius_m')::integer not between 10 and 1000000 or length(coalesce(d->>'address',''))>500 then raise exception 'invalid_zone';end if;
 end if;
 if p_version=0 then
  insert into public.work_records(id,company_id,kind,name,status,project_id,worker_id,data,created_by,updated_by) values(p_id,p_company,p_kind,nm,st,proj,worker,d,auth.uid(),auth.uid());
 else
  update public.work_records set name=nm,status=st,project_id=proj,worker_id=worker,data=d,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 end if;
 return p_id;
end;$$;

create function public.record_inventory_movement(p_company uuid,p_id uuid,p_item uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.work_records;existing public.inventory_movements;orig public.inventory_movements;q numeric;dt date;proj uuid;ref text;why text;rev uuid;
begin
 if not app_private.can_access(p_company,'inventario','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_data is null or octet_length(p_data::text)>6000 then raise exception 'invalid_movement';end if;
 select * into item from public.work_records where company_id=p_company and id=p_item and kind='inventory' for update;
 if not found then raise exception 'item_unavailable';end if;
 rev:=nullif(p_data->>'reversal_of','')::uuid;why:=trim(p_data->>'reason');ref:=trim(coalesce(p_data->>'reference',''));dt:=(p_data->>'movement_date')::date;proj:=nullif(p_data->>'project_id','')::uuid;
 if why is null or length(why) not between 3 and 2000 or length(ref)>100 or dt is null then raise exception 'invalid_movement';end if;
 if rev is null then
  if coalesce(p_data->>'quantity','') !~ '^-?[0-9]{1,9}(\.[0-9]{1,3})?$' then raise exception 'invalid_quantity';end if;
  q:=(p_data->>'quantity')::numeric;
 else
  select * into orig from public.inventory_movements where company_id=p_company and item_id=p_item and id=rev;
  if not found or orig.reversal_of is not null then raise exception 'invalid_reversal';end if;
  q:=-orig.quantity;proj:=orig.project_id;
 end if;
 select * into existing from public.inventory_movements where company_id=p_company and id=p_id;
 if found then
  if (existing.item_id,existing.quantity,existing.reason,existing.reference,existing.movement_date,existing.project_id,existing.reversal_of) is not distinct from (p_item,q,why,ref,dt,proj,rev) then return p_id;end if;
  raise exception 'request_conflict';
 end if;
 if p_version is null or item.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 if item.status<>'ACTIVO' or q=0 then raise exception 'invalid_movement';end if;
 if proj is not null and rev is null and (not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=proj)) then raise exception 'project_unavailable';end if;
 if item.stock+q<0 then raise exception 'insufficient_stock';end if;
 insert into public.inventory_movements(id,company_id,item_id,project_id,movement_date,quantity,reason,reference,reversal_of,created_by) values(p_id,p_company,p_item,proj,dt,q,why,ref,rev,auth.uid());
 update public.work_records set stock=stock+q,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_item;
 return p_id;
end;$$;
revoke all on function public.save_work_record(uuid,uuid,integer,text,jsonb),public.record_inventory_movement(uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_work_record(uuid,uuid,integer,text,jsonb),public.record_inventory_movement(uuid,uuid,uuid,integer,jsonb) to authenticated;

-- Shared private attachment store; objects are immutable, references can be archived.
create table public.work_attachments (
 id uuid primary key,company_id uuid not null,record_id uuid not null,path text not null unique,
 name text not null check(length(name) between 1 and 255),active boolean not null default true,version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,record_id) references public.work_records(company_id,id)
);
alter table public.work_attachments enable row level security;
revoke all on public.work_attachments from public,anon,authenticated;
grant select on public.work_attachments to authenticated;
create policy work_attachments_read on public.work_attachments for select to authenticated using(exists(select 1 from public.work_records r where r.company_id=work_attachments.company_id and r.id=record_id));
create trigger work_attachments_audit after insert or update on public.work_attachments for each row execute function app_private.audit_change();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('work-files','work-files',false,5000000,array['image/png','image/jpeg','image/webp','application/pdf']);
create function app_private.work_file_access(p_path text,p_action text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[];
begin
 if p_path is null or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$' then return false;end if;
 parts:=string_to_array(p_path,'/');
 return exists(select 1 from public.work_records r where r.company_id=parts[1]::uuid and r.id=parts[2]::uuid and app_private.can_access(r.company_id,app_private.work_module(r.kind),p_action));
exception when invalid_text_representation then return false;
end;$$;
revoke all on function app_private.work_file_access(text,text) from public;
grant execute on function app_private.work_file_access(text,text) to authenticated;
create policy work_files_read on storage.objects for select to authenticated using(bucket_id='work-files' and app_private.work_file_access(name,'read'));
create policy work_files_insert on storage.objects for insert to authenticated with check(bucket_id='work-files' and app_private.work_file_access(name,'write'));
create function public.set_work_attachment(p_company uuid,p_record uuid,p_record_version integer,p_id uuid,p_path text,p_name text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.work_records;f public.work_attachments;
begin
 select * into r from public.work_records where company_id=p_company and id=p_record for update;
 if not found or not app_private.can_access(p_company,app_private.work_module(r.kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_record_version is null or r.version<>p_record_version then raise exception 'record_conflict' using errcode='40001';end if;
 if p_id is null or p_active is null or p_name is null or length(p_name) not between 1 and 255 then raise exception 'invalid_attachment';end if;
 if not app_private.is_manager(p_company) and r.status in ('ANULADO','ARCHIVADO') then raise exception 'manager_required' using errcode='42501';end if;
 select * into f from public.work_attachments where company_id=p_company and record_id=p_record and id=p_id;
 if found then
  if (f.path,f.name) is distinct from (p_path,p_name) then raise exception 'immutable_attachment';end if;
  update public.work_attachments set active=p_active,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 else
  if p_path is null or split_part(p_path,'/',1)<>p_company::text or split_part(p_path,'/',2)<>p_record::text or not app_private.work_file_access(p_path,'write') or not exists(select 1 from storage.objects where bucket_id='work-files' and name=p_path) then raise exception 'invalid_attachment';end if;
  insert into public.work_attachments(id,company_id,record_id,path,name,active,created_by,updated_by) values(p_id,p_company,p_record,p_path,p_name,p_active,auth.uid(),auth.uid());
 end if;
 update public.work_records set status=case when kind='manuals' and status='APROBADO' then 'EN_REVISION' else status end,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_record;
end;$$;
revoke all on function public.set_work_attachment(uuid,uuid,integer,uuid,text,text,boolean) from public,anon;
grant execute on function public.set_work_attachment(uuid,uuid,integer,uuid,text,text,boolean) to authenticated;

create function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
revoke all on function app_private.audit_module(text,jsonb) from public;
create or replace function public.record_history(p_company uuid,p_entity text,p_id uuid,p_before bigint default null) returns table(id bigint,operation text,created_at timestamptz,actor_id uuid,before_data jsonb,after_data jsonb) language plpgsql stable security definer set search_path='' as $$
declare m text;d jsonb;
begin
 if p_entity='work_records' then select jsonb_build_object('kind',r.kind) into d from public.work_records r where r.company_id=p_company and r.id=p_id;end if;
 m:=app_private.audit_module(p_entity,d);
 if m is null or not app_private.can_access(p_company,m,'read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.operation,a.created_at,a.actor_id,a.before_data,a.after_data from public.audit_events a where a.company_id=p_company and a.entity=p_entity and a.entity_id=p_id::text and (p_before is null or a.id<p_before) order by a.id desc limit 30;
end;$$;
create or replace function public.activity_feed(p_company uuid,p_before bigint default null) returns table(id bigint,entity text,entity_id text,operation text,created_at timestamptz) language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'activity','read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.entity,a.entity_id,a.operation,a.created_at from public.audit_events a where a.company_id=p_company and (p_before is null or a.id<p_before) and (app_private.is_manager(p_company) or app_private.can_access(p_company,app_private.audit_module(a.entity,coalesce(a.after_data,a.before_data)),'read')) order by a.id desc limit 50;
end;$$;
commit;
