-- Workers are operational records, separate from login accounts. Expenses keep audited edits.
begin;
create table public.workers(
 id uuid primary key,company_id uuid not null references public.companies(id),name text not null check(length(trim(name)) between 2 and 190),
 email text not null default '' check(length(email)<=254),phone text not null default '' check(length(phone)<=64),
 job_title text not null default '' check(length(job_title)<=128),team text not null default '' check(length(team)<=128),
 hourly_rate numeric(12,2) not null default 0 check(hourly_rate>=0),weekly_target integer not null default 40 check(weekly_target between 0 and 168),
 active boolean not null default true,notes text not null default '' check(length(notes)<=10000),version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(company_id,id)
);
create table public.expenses(
 id uuid primary key,company_id uuid not null references public.companies(id),project_id uuid,worker_id uuid,
 expense_date date not null,category text not null check(length(trim(category)) between 1 and 64),description text not null default '' check(length(description)<=2000),
 vendor text not null default '' check(length(vendor)<=190),document_number text not null default '' check(length(document_number)<=100),amount numeric(12,2) not null check(amount>0),
 method text not null check(method in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','OTRO')),
 reimbursement_status text not null default 'NO_APLICA' check(reimbursement_status in ('NO_APLICA','PENDIENTE','REEMBOLSADO')),
 status text not null default 'PENDIENTE' check(status in ('PENDIENTE','APROBADO','RECHAZADO','ANULADO')),decision_note text not null default '' check(length(decision_note)<=2000),
 receipt_path text,version integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,project_id) references public.projects(company_id,id),foreign key(company_id,worker_id) references public.workers(company_id,id),check(reimbursement_status='NO_APLICA' or worker_id is not null)
);
create unique index expense_document_unique on public.expenses(company_id,lower(trim(vendor)),lower(trim(document_number))) where vendor<>'' and document_number<>'' and status<>'ANULADO';
create index workers_company_name on public.workers(company_id,name,id);
create index expenses_company_date on public.expenses(company_id,expense_date desc,id);
alter table public.workers enable row level security;
alter table public.expenses enable row level security;
revoke all on public.workers,public.expenses from anon,authenticated;
grant select on public.workers,public.expenses to authenticated;
create policy workers_read on public.workers for select to authenticated using(app_private.can_access(company_id,'trabajadores','read'));
create policy expenses_read on public.expenses for select to authenticated using(app_private.can_access(company_id,'gastos','read'));
create trigger workers_audit after insert or update on public.workers for each row execute function app_private.audit_change();
create trigger expenses_audit after insert or update on public.expenses for each row execute function app_private.audit_change();
create function public.save_worker(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.workers;nm text;em text;ph text;jt text;tm text;rate numeric;target integer;act boolean;nt text;
begin
 if not app_private.can_access(p_company,'trabajadores','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'invalid_worker';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then select * into oldrow from public.workers where company_id=p_company and id=p_id for update;if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;end if;
 if coalesce(p_data->>'hourly_rate','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or coalesce(p_data->>'weekly_target','') !~ '^[0-9]{1,3}$' or jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'invalid_worker';end if;
 nm:=trim(p_data->>'name');em:=coalesce(p_data->>'email','');ph:=coalesce(p_data->>'phone','');jt:=coalesce(p_data->>'job_title','');tm:=coalesce(p_data->>'team','');rate:=(p_data->>'hourly_rate')::numeric;target:=(p_data->>'weekly_target')::integer;act:=(p_data->>'active')::boolean;nt:=coalesce(p_data->>'notes','');
 if nm is null or length(nm) not between 2 and 190 or length(em)>254 or length(ph)>64 or length(jt)>128 or length(tm)>128 or target>168 or length(nt)>10000 then raise exception 'invalid_worker';end if;
 if p_version=0 then insert into public.workers(id,company_id,name,email,phone,job_title,team,hourly_rate,weekly_target,active,notes,created_by,updated_by) values(p_id,p_company,nm,em,ph,jt,tm,rate,target,act,nt,auth.uid(),auth.uid());
 else update public.workers set name=nm,email=em,phone=ph,job_title=jt,team=tm,hourly_rate=rate,weekly_target=target,active=act,notes=nt,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$$;
create function public.save_expense(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.expenses;proj uuid;worker uuid;dt date;cat text;descr text;ven text;doc text;a numeric;mt text;rs text;st text;dn text;changed boolean;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>15000 then raise exception 'invalid_expense';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then select * into oldrow from public.expenses where company_id=p_company and id=p_id for update;if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;end if;
 proj:=nullif(p_data->>'project_id','')::uuid;worker:=nullif(p_data->>'worker_id','')::uuid;
 if proj is not null and (p_version=0 or proj is distinct from oldrow.project_id) then
  if not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=proj) then raise exception 'project_unavailable';end if;
 end if;
 if worker is not null and (p_version=0 or worker is distinct from oldrow.worker_id) then
  if not app_private.can_access(p_company,'trabajadores','read') or not exists(select 1 from public.workers where company_id=p_company and id=worker and active) then raise exception 'worker_unavailable';end if;
 end if;
 if coalesce(p_data->>'amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_amount';end if;
 dt:=(p_data->>'expense_date')::date;cat:=trim(p_data->>'category');descr:=coalesce(p_data->>'description','');ven:=trim(coalesce(p_data->>'vendor',''));doc:=trim(coalesce(p_data->>'document_number',''));a:=(p_data->>'amount')::numeric;mt:=p_data->>'method';rs:=p_data->>'reimbursement_status';st:=p_data->>'status';dn:=coalesce(p_data->>'decision_note','');
 if dt is null or cat is null or length(cat) not between 1 and 64 or length(descr)>2000 or length(ven)>190 or length(doc)>100 or a<=0 or mt is null or mt not in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','OTRO') or rs is null or rs not in ('NO_APLICA','PENDIENTE','REEMBOLSADO') or (rs<>'NO_APLICA' and worker is null) or st is null or st not in ('PENDIENTE','APROBADO','RECHAZADO','ANULADO') or length(dn)>2000 then raise exception 'invalid_expense';end if;
 if st in ('RECHAZADO','ANULADO') and length(trim(dn))<3 then raise exception 'reason_required';end if;
 changed:=p_version>0 and (proj,worker,dt,cat,descr,ven,doc,a,mt) is distinct from (oldrow.project_id,oldrow.worker_id,oldrow.expense_date,oldrow.category,oldrow.description,oldrow.vendor,oldrow.document_number,oldrow.amount,oldrow.method);
 if not app_private.is_manager(p_company) then
  if p_version>0 and oldrow.status='ANULADO' then raise exception 'manager_required' using errcode='42501';end if;
  if (st in ('APROBADO','RECHAZADO','ANULADO') and (p_version=0 or st is distinct from oldrow.status)) or (rs='REEMBOLSADO' and (p_version=0 or rs is distinct from oldrow.reimbursement_status)) or (p_version>0 and dn is distinct from oldrow.decision_note) then raise exception 'manager_required' using errcode='42501';end if;
 end if;
 -- Editing approved/rejected financial data always requires a new review, even by an administrator.
 if changed and oldrow.reimbursement_status='REEMBOLSADO' then rs:='PENDIENTE';end if;
 if changed and oldrow.status in ('APROBADO','RECHAZADO') then st:='PENDIENTE';dn:='Datos corregidos; requiere nueva revisión.';end if;
 if p_version=0 then insert into public.expenses(id,company_id,project_id,worker_id,expense_date,category,description,vendor,document_number,amount,method,reimbursement_status,status,decision_note,created_by,updated_by) values(p_id,p_company,proj,worker,dt,cat,descr,ven,doc,a,mt,rs,st,dn,auth.uid(),auth.uid());
 else update public.expenses set project_id=proj,worker_id=worker,expense_date=dt,category=cat,description=descr,vendor=ven,document_number=doc,amount=a,method=mt,reimbursement_status=rs,status=st,decision_note=dn,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$$;
revoke all on function public.save_worker(uuid,uuid,integer,jsonb),public.save_expense(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_worker(uuid,uuid,integer,jsonb),public.save_expense(uuid,uuid,integer,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-receipts','expense-receipts',false,5000000,array['image/png','image/jpeg','image/webp','application/pdf']);
create function app_private.expense_receipt_access(p_name text,p_action text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[];
begin
 if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$' then return false;end if;
 parts:=string_to_array(p_name,'/');
 return exists(select 1 from public.expenses where company_id=parts[1]::uuid and id=parts[2]::uuid and app_private.can_access(company_id,'gastos',p_action));
exception when invalid_text_representation then return false;
end;$$;
revoke all on function app_private.expense_receipt_access(text,text) from public;
grant execute on function app_private.expense_receipt_access(text,text) to authenticated;
create policy expense_receipt_read on storage.objects for select to authenticated using(bucket_id='expense-receipts' and app_private.expense_receipt_access(name,'read'));
create policy expense_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='expense-receipts' and app_private.expense_receipt_access(name,'write'));
create function public.set_expense_receipt(p_company uuid,p_id uuid,p_version integer,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare e public.expenses;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.expenses where company_id=p_company and id=p_id for update;
 if not found or p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 if p_path is not null and (not app_private.expense_receipt_access(p_path,'write') or split_part(p_path,'/',1)<>p_company::text or split_part(p_path,'/',2)<>p_id::text or not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=p_path)) then raise exception 'invalid_receipt';end if;
 update public.expenses set receipt_path=p_path,status=case when status in ('APROBADO','RECHAZADO') then 'PENDIENTE' else status end,decision_note=case when status in ('APROBADO','RECHAZADO') then 'Recibo corregido; requiere nueva revisión.' else decision_note end,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;
revoke all on function public.set_expense_receipt(uuid,uuid,integer,text) from public,anon;
grant execute on function public.set_expense_receipt(uuid,uuid,integer,text) to authenticated;
create or replace function public.activity_feed(p_company uuid,p_before bigint default null) returns table(id bigint,entity text,entity_id text,operation text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'activity','read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.entity,a.entity_id,a.operation,a.created_at from public.audit_events a where a.company_id=p_company and (p_before is null or a.id<p_before)
 and (app_private.is_manager(p_company) or case a.entity when 'customers' then app_private.can_access(p_company,'clientes','read') when 'leads' then app_private.can_access(p_company,'crm','read') when 'products' then app_private.can_access(p_company,'productos','read') when 'estimates' then app_private.can_access(p_company,'fin-estimados','read') when 'invoices' then app_private.can_access(p_company,'fin-invoices','read') when 'payments' then app_private.can_access(p_company,'fin-invoices','read') when 'projects' then app_private.can_access(p_company,'fin-proyectos','read') when 'workers' then app_private.can_access(p_company,'trabajadores','read') when 'expenses' then app_private.can_access(p_company,'gastos','read') else false end)
 order by a.id desc limit 50;
end;$$;
create or replace function public.record_history(p_company uuid,p_entity text,p_id uuid,p_before bigint default null)
returns table(id bigint,operation text,created_at timestamptz,actor_id uuid,before_data jsonb,after_data jsonb)
language plpgsql stable security definer set search_path='' as $$
declare module text;
begin
 module:=case p_entity when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' end;
 if module is null or not app_private.can_access(p_company,module,'read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.operation,a.created_at,a.actor_id,a.before_data,a.after_data from public.audit_events a
 where a.company_id=p_company and a.entity=p_entity and a.entity_id=p_id::text and (p_before is null or a.id<p_before) order by a.id desc limit 30;
end;$$;
revoke all on function public.record_history(uuid,text,uuid,bigint) from public,anon;
grant execute on function public.record_history(uuid,text,uuid,bigint) to authenticated;
commit;
