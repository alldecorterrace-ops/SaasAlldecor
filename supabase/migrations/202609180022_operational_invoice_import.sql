-- Copy a reviewed OPEN invoice and its APPLIED payments, preserving provenance.
-- This private import creates no estimate approval, email or bank transaction.
begin;
alter table public.invoices alter column estimate_id drop not null;
alter table public.invoices alter column estimate_version drop not null;
alter table public.invoices add column historical_invoice_id uuid;
alter table public.invoices add column historical_invoice_kind text generated always as ('invoices'::text) stored;
alter table public.invoices add constraint invoices_origin_required check(
 (estimate_id is not null and estimate_version is not null and historical_invoice_id is null) or
 (estimate_id is null and estimate_version is null and historical_invoice_id is not null));
alter table public.invoices add constraint invoices_historical_source foreign key(company_id,historical_invoice_kind,historical_invoice_id) references public.historical_business(company_id,kind,id);
alter table public.invoices add unique(company_id,historical_invoice_id);
alter table public.payments add column historical_payment_id uuid;
alter table public.payments add column historical_payment_kind text generated always as ('payments'::text) stored;
alter table public.payments add constraint payments_historical_source foreign key(company_id,historical_payment_kind,historical_payment_id) references public.historical_business(company_id,kind,id);
alter table public.payments add unique(company_id,historical_payment_id);
create table app_private.operational_invoice_imports(
 company_id uuid not null references public.companies(id),historical_id uuid not null,invoice_id uuid not null,
 expected jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(company_id,historical_id),foreign key(company_id,invoice_id) references public.invoices(company_id,id)
);
alter table app_private.operational_invoice_imports enable row level security;
revoke all on app_private.operational_invoice_imports from public,anon,authenticated;

create function app_private.invoice_import_money(v jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) not in ('string','number') or v is null or coalesce(v#>>'{}','')!~'^\d{1,12}(\.\d{1,2})?$' then raise exception 'invalid_invoice_import_money';end if;
 return (v#>>'{}')::numeric;
end;$$;
revoke all on function app_private.invoice_import_money(jsonb) from public,anon,authenticated;

create function app_private.import_operational_invoice(p_company uuid,p_actor uuid,p_historical uuid,p_expected jsonb) returns jsonb
language plpgsql set search_path='' set timezone='UTC' as $$
declare hist public.historical_business; o jsonb;j jsonb;line jsonb;items jsonb:='[]';
 source_hash text;payments_expected jsonb;prior app_private.operational_invoice_imports;
 cid uuid;pid uuid;iid uuid:=gen_random_uuid();payment_id uuid;pay record;po jsonb;method text;
 total numeric;subtotal numeric;discount numeric;taxes numeric;paid numeric;balance numeric;line_sum numeric:=0;amount numeric;paid_sum numeric:=0;
 copied_payments integer:=0;reference_keys text[]:='{}';refkey text;
begin
 if p_expected is null or jsonb_typeof(p_expected)<>'object' or not(p_expected ?& array['source_sha256','payments','customer_id','project_id']) or (select count(*) from jsonb_object_keys(p_expected))<>4 then raise exception 'invalid_invoice_import_expectation';end if;
 if not exists(select 1 from public.memberships where company_id=p_company and user_id=p_actor and active and role in ('owner','admin')) then raise exception 'invoice_import_actor_not_manager';end if;
 lock table public.invoices,public.payments,public.projects,public.historical_customer_migrations,public.historical_project_migrations in share row exclusive mode;
 perform id from public.companies where id=p_company for update;
 select * into prior from app_private.operational_invoice_imports where company_id=p_company and historical_id=p_historical;
 if found then
  if prior.expected is distinct from p_expected then raise exception 'invoice_import_plan_changed';end if;
  return jsonb_build_object('invoice_id',prior.invoice_id,'inserted',0,'payments',0,'unchanged',1);
 end if;
 select * into strict hist from public.historical_business where company_id=p_company and kind='invoices' and id=p_historical;
 select original,source_sha256 into strict o,source_hash from app_private.historical_business_sources where company_id=p_company and kind='invoices' and id=p_historical;
 if source_hash is distinct from p_expected->>'source_sha256' then raise exception 'invoice_source_changed';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'source_sha256',s.source_sha256) order by h.id),'[]') into payments_expected
 from public.historical_business h join app_private.historical_business_sources s using(company_id,kind,id)
 where h.company_id=p_company and h.kind='payments' and h.invoice_id=p_historical;
 if payments_expected is distinct from p_expected->'payments' then raise exception 'invoice_payment_source_changed';end if;
 if jsonb_array_length(payments_expected)>1000 then raise exception 'invoice_payment_limit';end if;
 select customer_id into cid from public.historical_customer_migrations where company_id=p_company and historical_id=hist.client_id and state='imported';
 select project_id into pid from public.historical_project_migrations where company_id=p_company and historical_id=hist.project_id and state='imported';
 if cid is null or pid is null or cid::text is distinct from p_expected->>'customer_id' or pid::text is distinct from p_expected->>'project_id' or not exists(select 1 from public.projects where company_id=p_company and id=pid and customer_id=cid and historical_project_id=hist.project_id) then raise exception 'invoice_destination_changed';end if;
 if exists(select 1 from public.invoices where company_id=p_company and (number=o->>'consecutive' or project_id=pid)) then raise exception 'invoice_duplicate_requires_review';end if;
 if o->>'status' is distinct from 'OPEN' or coalesce(o->>'service_external_id','')<>'' or coalesce(o->>'void_reason','')<>'' then raise exception 'invoice_source_requires_review';end if;
 if jsonb_typeof(o->'consecutive') is distinct from 'string' or length(btrim(o->>'consecutive')) not between 1 and 100 or o->>'consecutive'<>btrim(o->>'consecutive') then raise exception 'invalid_invoice_number';end if;
 if exists(select 1 from public.historical_business h where h.company_id=p_company and h.kind='invoices' and h.id<>p_historical and h.title=hist.title) then raise exception 'invoice_duplicate_requires_review';end if;
 if jsonb_typeof(o->'invoice_date') is distinct from 'string' or (o->>'invoice_date')!~'^\d{4}-\d{2}-\d{2}$' or to_char((o->>'invoice_date')::date,'YYYY-MM-DD')<>o->>'invoice_date' then raise exception 'invalid_invoice_date';end if;
 if jsonb_typeof(o->'notes') is distinct from 'string' or length(o->>'notes')>10000 then raise exception 'invalid_invoice_notes';end if;
 j:=(o->>'source_json')::jsonb;
 if jsonb_typeof(j) is distinct from 'object' or jsonb_typeof(j->'items') is distinct from 'array' or jsonb_array_length(j->'items') not between 1 and 100 then raise exception 'invoice_own_items_required';end if;
 total:=app_private.invoice_import_money(o->'total');paid:=app_private.invoice_import_money(o->'paid_amount');balance:=app_private.invoice_import_money(o->'balance_due');
 subtotal:=app_private.invoice_import_money(j->'subtotal');discount:=app_private.invoice_import_money(j->'discount');taxes:=app_private.invoice_import_money(j->'taxes');
 if total<=0 or app_private.invoice_import_money(j->'total')<>total or subtotal-discount+taxes<>total or discount>subtotal or paid>total or balance<>total-paid then raise exception 'invoice_amounts_require_review';end if;
 foreach refkey in array array['nombre','email','telefono','direccion'] loop
  if jsonb_typeof(j->refkey) is distinct from 'string' or length(j->>refkey)>2000 then raise exception 'invoice_customer_snapshot_required';end if;
 end loop;
 if length(btrim(j->>'nombre'))=0 then raise exception 'invoice_customer_snapshot_required';end if;
 for line in select value from jsonb_array_elements(j->'items') loop
  if jsonb_typeof(line) is distinct from 'object' or jsonb_typeof(line->'label') is distinct from 'string' or length(btrim(line->>'label')) not between 1 and 255 or jsonb_typeof(line->'spec') is distinct from 'string' or length(line->>'spec')>2000 then raise exception 'invalid_invoice_line';end if;
  amount:=app_private.invoice_import_money(line->'price');line_sum:=line_sum+amount;
  -- Fixed saved line amounts; no inferred dimensions, current prices or motor metadata.
  items:=items||jsonb_build_array(jsonb_build_object('product_id',null,'name',line->>'label','description',line->>'spec','base','fixed','qty','1','length','0','width','0','height','0','manual_total','0.00','unit_price',amount::text,'line_total',amount::text));
 end loop;
 if line_sum<>subtotal then raise exception 'invoice_line_total_mismatch';end if;
 -- Validate the entire payment set before inserting any financial row.
 for pay in select h.*,s.original from public.historical_business h join app_private.historical_business_sources s using(company_id,kind,id) where h.company_id=p_company and h.kind='payments' and h.invoice_id=p_historical order by h.id loop
  po:=pay.original;
  if pay.client_id is distinct from hist.client_id or pay.project_id is distinct from hist.project_id or po->>'invoice_external_id' is distinct from o->>'external_id' or po->>'client_external_id' is distinct from o->>'client_external_id' or po->>'project_external_id' is distinct from o->>'project_external_id' then raise exception 'invoice_payment_relationship';end if;
  if po->>'status' is distinct from 'APPLIED' or coalesce(po->>'void_reason','')<>'' or coalesce(po->>'method','') not in ('CASH','CHEQUE','Wire transfer','STRIPE','ZELL') then raise exception 'invoice_payment_requires_review';end if;
  if jsonb_typeof(po->'payment_date') is distinct from 'string' or (po->>'payment_date')!~'^\d{4}-\d{2}-\d{2}$' or to_char((po->>'payment_date')::date,'YYYY-MM-DD')<>po->>'payment_date' then raise exception 'invalid_invoice_payment_date';end if;
  if jsonb_typeof(po->'reference') is distinct from 'string' or length(po->>'reference')>255 or jsonb_typeof(po->'notes') is distinct from 'string' or length(po->>'notes')>2000 then raise exception 'invalid_invoice_payment_text';end if;
  refkey:=jsonb_build_array(po->>'method',btrim(po->>'reference'))::text;
  if btrim(po->>'reference')<>'' and refkey=any(reference_keys) then raise exception 'invoice_duplicate_payment_reference';end if;
  reference_keys:=array_append(reference_keys,refkey);
  amount:=app_private.invoice_import_money(po->'amount');if amount<=0 then raise exception 'invalid_invoice_payment_amount';end if;paid_sum:=paid_sum+amount;
 end loop;
 if paid_sum<>paid or o->>'payment_status' is distinct from (case when paid=0 then 'UNPAID' when paid=total then 'PAID' else 'PARTIAL' end) then raise exception 'invoice_payment_total_mismatch';end if;
 insert into public.invoices(id,company_id,number,estimate_id,estimate_version,historical_invoice_id,project_id,customer_id,customer_snapshot,items,subtotal,discount,taxes,total,invoice_date,notes,approval_note,status,paid_amount,balance_due,payment_status,created_by,updated_by)
 values(iid,p_company,o->>'consecutive',null,null,p_historical,pid,cid,jsonb_build_object('full_name',j->>'nombre','email',j->>'email','phone',j->>'telefono','address',j->>'direccion','city','','postal_code',''),items,subtotal,discount,taxes,total,(o->>'invoice_date')::date,o->>'notes','Copia de factura histórica ADT; no constituye una aprobación nueva.','OPEN',paid,balance,o->>'payment_status',p_actor,p_actor);
 for pay in select h.id,s.original from public.historical_business h join app_private.historical_business_sources s using(company_id,kind,id) where h.company_id=p_company and h.kind='payments' and h.invoice_id=p_historical order by h.id loop
  po:=pay.original;payment_id:=gen_random_uuid();method:=case po->>'method' when 'CASH' then 'EFECTIVO' when 'CHEQUE' then 'CHEQUE' when 'Wire transfer' then 'TRANSFERENCIA' when 'STRIPE' then 'TARJETA_EXTERNA' when 'ZELL' then 'OTRO' end;
  insert into public.payments(id,company_id,invoice_id,historical_payment_id,payment_date,amount,method,reference,notes,status,created_by,updated_by)
  values(payment_id,p_company,iid,pay.id,(po->>'payment_date')::date,app_private.invoice_import_money(po->'amount'),method,po->>'reference',po->>'notes','APPLIED',p_actor,p_actor);
  copied_payments:=copied_payments+1;
 end loop;
 insert into app_private.operational_invoice_imports(company_id,historical_id,invoice_id,expected,actor_id) values(p_company,p_historical,iid,p_expected,p_actor);
 return jsonb_build_object('invoice_id',iid,'inserted',1,'payments',copied_payments,'unchanged',0);
end;$$;
revoke all on function app_private.import_operational_invoice(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
commit;
