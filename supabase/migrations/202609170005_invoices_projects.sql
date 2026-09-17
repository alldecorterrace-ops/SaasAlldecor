-- Atomic estimate approval, projects, invoices and recorded payments.
-- No bank charges, emails or legacy imports are performed.
begin;
alter table public.estimates drop constraint estimates_status_check;
alter table public.estimates add constraint estimates_status_check check(status in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA','APROBADO'));
create table public.projects(
 id uuid primary key,company_id uuid not null references public.companies(id),
 estimate_id uuid not null,customer_id uuid not null,name text not null check(length(trim(name)) between 2 and 255),
 status text not null default 'NUEVO' check(status in ('NUEVO','PLANIFICACION','PRODUCCION','INSTALACION','COMPLETADO','CANCELADO')),
 project_date date not null,start_date date,end_date date,notes text not null default '' check(length(notes)<=10000),
 version integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,estimate_id),
 foreign key(company_id,estimate_id) references public.estimates(company_id,id),
 foreign key(company_id,customer_id) references public.customers(company_id,id),check(end_date is null or start_date is null or end_date>=start_date)
);
create table public.invoices(
 id uuid primary key,company_id uuid not null references public.companies(id),number text not null,
 estimate_id uuid not null,estimate_version integer not null,project_id uuid not null,customer_id uuid not null,
 customer_snapshot jsonb not null,items jsonb not null,subtotal numeric(14,2) not null,discount numeric(14,2) not null,taxes numeric(14,2) not null,total numeric(14,2) not null check(total>0),
 invoice_date date not null,due_date date,notes text not null default '' check(length(notes)<=10000),
 approval_note text not null check(length(trim(approval_note)) between 3 and 2000),
 status text not null default 'OPEN' check(status in ('OPEN','VOID')),paid_amount numeric(14,2) not null default 0,
 balance_due numeric(14,2) not null,payment_status text not null default 'UNPAID' check(payment_status in ('UNPAID','PARTIAL','PAID','VOID')),
 void_reason text not null default '',version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,number),unique(company_id,estimate_id),
 foreign key(company_id,estimate_id) references public.estimates(company_id,id),
 foreign key(company_id,project_id) references public.projects(company_id,id),
 foreign key(company_id,customer_id) references public.customers(company_id,id),
 check(paid_amount>=0 and paid_amount<=total),check(balance_due>=0),check(due_date is null or due_date>=invoice_date)
);
create table public.payments(
 id uuid primary key,company_id uuid not null,invoice_id uuid not null,payment_date date not null,
 amount numeric(14,2) not null check(amount>0),method text not null check(method in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','OTRO')),
 reference text not null default '' check(length(reference)<=255),notes text not null default '' check(length(notes)<=2000),
 status text not null default 'APPLIED' check(status in ('APPLIED','VOID')),void_reason text not null default '',version integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,invoice_id) references public.invoices(company_id,id)
);
create unique index payments_reference on public.payments(company_id,invoice_id,method,reference) where reference<>'';
create index invoices_company_date on public.invoices(company_id,invoice_date desc,id);
create index projects_company_date on public.projects(company_id,project_date desc,id);
create index payments_invoice on public.payments(company_id,invoice_id,payment_date,id);
alter table public.projects enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
revoke all on public.projects,public.invoices,public.payments from anon,authenticated;
grant select on public.projects,public.invoices,public.payments to authenticated;
create policy projects_read on public.projects for select to authenticated using(app_private.can_access(company_id,'fin-proyectos','read'));
create policy invoices_read on public.invoices for select to authenticated using(app_private.can_access(company_id,'fin-invoices','read'));
create policy payments_read on public.payments for select to authenticated using(app_private.can_access(company_id,'fin-invoices','read'));
create trigger projects_audit after insert or update on public.projects for each row execute function app_private.audit_change();
create trigger invoices_audit after insert or update on public.invoices for each row execute function app_private.audit_change();
create trigger payments_audit after insert or update on public.payments for each row execute function app_private.audit_change();

create function app_private.lock_approved_estimate() returns trigger language plpgsql set search_path='' as $$
begin
 if OLD.status='APROBADO' then raise exception 'approved_estimate_locked';end if;
 return NEW;
end;$$;
revoke all on function app_private.lock_approved_estimate() from public;
create trigger approved_estimate_lock before update on public.estimates for each row execute function app_private.lock_approved_estimate();

create function public.approve_estimate(p_company uuid,p_id uuid,p_version integer,p_date date,p_name text,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.estimates;inv public.invoices;proj uuid:=gen_random_uuid();iid uuid:=gen_random_uuid();seq integer;yr integer;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') or not app_private.can_access(p_company,'fin-invoices','write') or not app_private.can_access(p_company,'fin-proyectos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.estimates where company_id=p_company and id=p_id for update;
 if not found then raise exception 'estimate_unavailable';end if;
 -- A retry of the same approved estimate returns the existing invoice, even after a void.
 select * into inv from public.invoices where company_id=p_company and estimate_id=p_id;
 if found then return inv.id;end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 if e.status not in ('BORRADOR','PENDIENTE') or e.total<=0 or p_date is null or p_name is null or length(trim(p_name)) not between 2 and 255 or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'invalid_approval';end if;
 insert into public.projects(id,company_id,estimate_id,customer_id,name,project_date,created_by,updated_by)
 values(proj,p_company,p_id,e.customer_id,trim(p_name),p_date,auth.uid(),auth.uid());
 yr:=extract(year from p_date)::integer;
 insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'INV',yr,1)
 on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
 insert into public.invoices(id,company_id,number,estimate_id,estimate_version,project_id,customer_id,customer_snapshot,items,subtotal,discount,taxes,total,invoice_date,balance_due,approval_note,created_by,updated_by)
 values(iid,p_company,'INV-'||yr||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'),p_id,e.version,proj,e.customer_id,e.customer_snapshot,e.items,e.subtotal,e.discount,e.taxes,e.total,p_date,e.total,trim(p_note),auth.uid(),auth.uid());
 update public.estimates set status='APROBADO',version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 return iid;
end;$$;

create function app_private.recompute_invoice(p_company uuid,p_invoice uuid) returns void language plpgsql security definer set search_path='' as $$
declare paid numeric;i public.invoices;
begin
 select * into strict i from public.invoices where company_id=p_company and id=p_invoice for update;
 select coalesce(sum(amount),0) into paid from public.payments where company_id=p_company and invoice_id=p_invoice and status='APPLIED';
 if paid>i.total then raise exception 'overpayment';end if;
 update public.invoices set paid_amount=paid,balance_due=case when status='VOID' then 0 else total-paid end,
 payment_status=case when status='VOID' then 'VOID' when paid=total then 'PAID' when paid>0 then 'PARTIAL' else 'UNPAID' end,
 version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_invoice;
end;$$;
revoke all on function app_private.recompute_invoice(uuid,uuid) from public,anon,authenticated;

create function public.record_payment(p_company uuid,p_id uuid,p_invoice uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.invoices;existing public.payments;a numeric;dt date;mt text;ref text;nt text;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or coalesce(p_data->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'invalid_payment';end if;
 a:=(p_data->>'amount')::numeric;dt:=(p_data->>'payment_date')::date;mt:=p_data->>'method';ref:=coalesce(p_data->>'reference','');nt:=coalesce(p_data->>'notes','');
 if a<=0 or dt is null or mt is null or mt not in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','OTRO') or length(ref)>255 or length(nt)>2000 then raise exception 'invalid_payment';end if;
 select * into i from public.invoices where company_id=p_company and id=p_invoice for update;
 if not found then raise exception 'invoice_unavailable';end if;
 select * into existing from public.payments where id=p_id;
 if found then
   if existing.company_id=p_company and existing.invoice_id=p_invoice and existing.amount=a and existing.payment_date=dt and existing.method=mt and existing.reference=ref and existing.notes=nt then return existing.id;end if;
   raise exception 'payment_conflict';
 end if;
 if p_version is null or i.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 if i.status='VOID' then raise exception 'invoice_void';end if;
 if a>i.balance_due then raise exception 'overpayment';end if;
 insert into public.payments(id,company_id,invoice_id,payment_date,amount,method,reference,notes,created_by,updated_by)
 values(p_id,p_company,p_invoice,dt,a,mt,ref,nt,auth.uid(),auth.uid());
 perform app_private.recompute_invoice(p_company,p_invoice);
 return p_id;
end;$$;

create function public.void_payment(p_company uuid,p_id uuid,p_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payments;iid uuid;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'reason_required';end if;
 select invoice_id into iid from public.payments where company_id=p_company and id=p_id;
 if iid is null then raise exception 'payment_unavailable';end if;
 -- Always lock invoice before payment, same order as recording a payment.
 perform 1 from public.invoices where company_id=p_company and id=iid for update;
 select * into p from public.payments where company_id=p_company and id=p_id for update;
 if p.status='VOID' then return;end if;
 if p_version is null or p.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 update public.payments set status='VOID',void_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 perform app_private.recompute_invoice(p_company,iid);
end;$$;

create function public.update_invoice(p_company uuid,p_id uuid,p_version integer,p_date date,p_due date,p_notes text,p_void_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare i public.invoices;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into i from public.invoices where company_id=p_company and id=p_id for update;
 if not found or p_version is null or i.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 if i.status='VOID' then raise exception 'invoice_void';end if;
 if p_date is null or (p_due is not null and p_due<p_date) or p_notes is null or length(p_notes)>10000 then raise exception 'invalid_invoice';end if;
 if p_void_reason is not null then
  if length(trim(p_void_reason)) not between 3 and 2000 then raise exception 'reason_required';end if;
  if i.paid_amount>0 then raise exception 'reverse_payments_first';end if;
 end if;
 update public.invoices set invoice_date=p_date,due_date=p_due,notes=p_notes,
 status=case when p_void_reason is null then status else 'VOID' end,
 payment_status=case when p_void_reason is null then payment_status else 'VOID' end,
 balance_due=case when p_void_reason is null then balance_due else 0 end,
 void_reason=coalesce(trim(p_void_reason),''),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;

create function public.update_project(p_company uuid,p_id uuid,p_version integer,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects;st text;nm text;sd date;ed date;nt text;
begin
 if not app_private.can_access(p_company,'fin-proyectos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_project';end if;
 -- Lock financial parent first so scheduling cannot race with a payment reversal.
 perform 1 from public.invoices where company_id=p_company and project_id=p_id for update;
 select * into p from public.projects where company_id=p_company and id=p_id for update;
 if not found or p_version is null or p.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 nm:=p_data->>'name';st:=p_data->>'status';sd:=nullif(p_data->>'start_date','')::date;ed:=nullif(p_data->>'end_date','')::date;nt:=p_data->>'notes';
 if nm is null or length(trim(nm)) not between 2 and 255 or st is null or st not in ('NUEVO','PLANIFICACION','PRODUCCION','INSTALACION','COMPLETADO','CANCELADO') or nt is null or length(nt)>10000 or (sd is not null and ed is not null and ed<sd) then raise exception 'invalid_project';end if;
 if (st in ('PRODUCCION','INSTALACION','COMPLETADO') and st<>p.status) or (sd is not null and sd is distinct from p.start_date) then
  if not exists(select 1 from public.invoices where company_id=p_company and project_id=p_id and status='OPEN' and paid_amount>0) then raise exception 'deposit_required';end if;
 end if;
 update public.projects set name=trim(nm),status=st,start_date=sd,end_date=ed,notes=nt,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;
revoke all on function public.approve_estimate(uuid,uuid,integer,date,text,text),public.record_payment(uuid,uuid,uuid,integer,jsonb),public.void_payment(uuid,uuid,integer,text),public.update_invoice(uuid,uuid,integer,date,date,text,text),public.update_project(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.approve_estimate(uuid,uuid,integer,date,text,text),public.record_payment(uuid,uuid,uuid,integer,jsonb),public.void_payment(uuid,uuid,integer,text),public.update_invoice(uuid,uuid,integer,date,date,text,text),public.update_project(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.activity_feed(p_company uuid,p_before bigint default null) returns table(id bigint,entity text,entity_id text,operation text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'activity','read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.entity,a.entity_id,a.operation,a.created_at from public.audit_events a where a.company_id=p_company and (p_before is null or a.id<p_before)
 and (app_private.is_manager(p_company) or case a.entity when 'customers' then app_private.can_access(p_company,'clientes','read') when 'leads' then app_private.can_access(p_company,'crm','read') when 'products' then app_private.can_access(p_company,'productos','read') when 'estimates' then app_private.can_access(p_company,'fin-estimados','read') when 'invoices' then app_private.can_access(p_company,'fin-invoices','read') when 'payments' then app_private.can_access(p_company,'fin-invoices','read') when 'projects' then app_private.can_access(p_company,'fin-proyectos','read') else false end)
 order by a.id desc limit 50;
end;$$;
create function public.record_history(p_company uuid,p_entity text,p_id uuid,p_before bigint default null)
returns table(id bigint,operation text,created_at timestamptz,actor_id uuid,before_data jsonb,after_data jsonb)
language plpgsql stable security definer set search_path='' as $$
declare module text;
begin
 module:=case p_entity when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' end;
 if module is null or not app_private.can_access(p_company,module,'read') then raise exception 'permission_denied' using errcode='42501';end if;
 return query select a.id,a.operation,a.created_at,a.actor_id,a.before_data,a.after_data from public.audit_events a
 where a.company_id=p_company and a.entity=p_entity and a.entity_id=p_id::text and (p_before is null or a.id<p_before) order by a.id desc limit 30;
end;$$;
revoke all on function public.record_history(uuid,text,uuid,bigint) from public,anon;
grant execute on function public.record_history(uuid,text,uuid,bigint) to authenticated;
commit;
