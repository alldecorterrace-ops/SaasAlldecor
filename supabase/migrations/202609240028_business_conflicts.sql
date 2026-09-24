-- Business conflicts must not use PostgreSQL serialization_failure (40001).
-- PostgREST 14 retries that code indefinitely. PT409 ends the request with HTTP 409.
-- Additive replacement preserves signatures, ownership, grants and business behavior.
-- Keep genuine serialization failures distinct from stale edits/claims.

begin;

CREATE OR REPLACE FUNCTION app_private.complete_operation(p_company uuid, p_request uuid, p_claim uuid, p_status text, p_reference text, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r app_private.operation_requests;
begin
  select * into r from app_private.operation_requests where company_id=p_company and id=p_request for update;
  if not found or p_claim is null or r.claim_token is distinct from p_claim then raise exception 'claim_conflict' using errcode='PT409'; end if;
  if p_status is null or p_status not in ('succeeded','rejected','review') or p_code is null
    or p_code !~ '^[a-z_]{2,60}$' or length(p_reference)>200 or (p_status='succeeded' and nullif(trim(p_reference),'') is null) then
    raise exception 'invalid_result' using errcode='22023'; end if;
  if r.status=p_status and r.result_reference is not distinct from p_reference and r.result_code=p_code then return; end if;
  if r.status<>'processing' then raise exception 'result_conflict' using errcode='PT409'; end if;
  update app_private.operation_requests set status=p_status,result_reference=p_reference,result_code=p_code,
    completed_at=case when p_status='review' then null else now() end where company_id=p_company and id=p_request;
  insert into app_private.operation_events(company_id,request_id,status) values(p_company,p_request,p_status);
end; $function$;

CREATE OR REPLACE FUNCTION app_private.execute_saas_customer_operation(p_company uuid, p_epoch bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare claim jsonb; body jsonb; rid uuid; cid uuid; before_row jsonb; after_row jsonb;
  previous_actor text:=current_setting('request.jwt.claim.sub',true); result_status text:='succeeded'; result_code text:='completed';
begin
  claim:=app_private.claim_operation_for_action(p_company,'saas',p_epoch,'customer.save');
  if claim is null then return null; end if;
  rid:=(claim->>'id')::uuid; body:=claim->'payload';
  perform set_config('request.jwt.claim.sub',claim->>'actorId',true);
  begin
    if (body->>'recordId') is null or (body->>'version') is null or jsonb_typeof(body->'data') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(body) k where k not in ('recordId','version','data')) then
      raise exception 'invalid_request' using errcode='22023'; end if;
    cid:=(body->>'recordId')::uuid;
    select to_jsonb(x) into before_row from public.customers x where company_id=p_company and id=cid for update;
    perform public.save_customer(p_company,cid,(body->>'version')::integer,body->'data');
    select to_jsonb(x) into after_row from public.customers x where company_id=p_company and id=cid;
    insert into app_private.operation_effects(company_id,request_id,entity,entity_id,entity_version,before_data,after_data)
      values(p_company,rid,'customers',cid,(after_row->>'version')::integer,before_row,after_row);
  exception when sqlstate '22023' or sqlstate '22P02' or sqlstate '22007' or sqlstate '22008' or sqlstate '23502' or sqlstate '23505' or sqlstate '23514' or sqlstate '40001' or sqlstate 'PT409' or sqlstate '42501' then
    result_status:='rejected'; result_code:='validation_or_access_failed'; cid:=null;
  when raise_exception then
    if SQLERRM<>'invalid_customer' then raise; end if;
    result_status:='rejected'; result_code:='validation_or_access_failed'; cid:=null;
  end;
  perform app_private.complete_operation(p_company,rid,(claim->>'claimToken')::uuid,result_status,cid::text,result_code);
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return jsonb_build_object('id',rid,'status',result_status,'resultReference',cid);
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  raise;
end; $function$;

CREATE OR REPLACE FUNCTION app_private.finalize_adt_transition(p_company uuid, p_transition uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c app_private.transition_controls; t app_private.transition_sessions; proof app_private.transition_clearances;
begin
  select * into c from app_private.transition_controls where company_id=p_company for update;
  select * into t from app_private.transition_sessions where id=p_transition and company_id=p_company for update;
  if t.status='completed' and c.authority='saas' and c.epoch=t.from_epoch+1 then return c.epoch; end if;
  if c.phase is distinct from 'draining' or c.transition_id is distinct from p_transition or t.status is distinct from 'draining'
    or c.authority<>'adt' or t.from_authority<>'adt' or c.epoch<>t.from_epoch then raise exception 'transition_conflict' using errcode='PT409'; end if;
  select * into proof from app_private.transition_clearances where transition_id=p_transition;
  if not found or proof.verified_at>clock_timestamp() or proof.verified_at<t.started_at or proof.expires_at<=clock_timestamp()
    or not exists(select 1 from public.memberships where company_id=p_company and user_id=proof.verified_by and role='owner' and active) then
    raise exception 'transition_not_cleared' using errcode='55000'; end if;
  if exists(select 1 from app_private.operation_requests where company_id=p_company and status in ('processing','review'))
    or exists(select 1 from app_private.operation_requests where company_id=p_company and enqueue_sequence<=t.cutoff and status='queued') then
    raise exception 'drain_incomplete' using errcode='55000'; end if;
  if exists(select 1 from app_private.operation_requests where company_id=p_company and enqueue_sequence>t.cutoff and (status<>'queued' or authority is not null)) then
    raise exception 'unexpected_post_cut_assignment' using errcode='55000'; end if;
  if exists(select 1 from app_private.operation_handlers h where not exists(select 1 from app_private.operation_adapters a where a.action=h.action and a.authority='saas' and a.verified)) then
    raise exception 'adapter_coverage_incomplete' using errcode='55000'; end if;
  update app_private.operation_requests set authority='saas',epoch=c.epoch+1 where company_id=p_company and authority is null and status='queued';
  update app_private.transition_controls set authority='saas',epoch=c.epoch+1,phase='accepting',transition_id=null,updated_at=now() where company_id=p_company;
  update app_private.transition_sessions set status='completed',completed_at=now() where id=p_transition;
  insert into app_private.transition_events(company_id,actor_id,authority,epoch,phase) values(p_company,proof.verified_by,'saas',c.epoch+1,'accepting');
  return c.epoch+1;
end; $function$;

CREATE OR REPLACE FUNCTION public.approve_estimate(p_company uuid, p_id uuid, p_version integer, p_date date, p_name text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.estimates;inv public.invoices;proj uuid:=gen_random_uuid();iid uuid:=gen_random_uuid();seq integer;yr integer;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') or not app_private.can_access(p_company,'fin-invoices','write') or not app_private.can_access(p_company,'fin-proyectos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.estimates where company_id=p_company and id=p_id for update;
 if not found then raise exception 'estimate_unavailable';end if;
 -- A retry of the same approved estimate returns the existing invoice, even after a void.
 select * into inv from public.invoices where company_id=p_company and estimate_id=p_id;
 if found then return inv.id;end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION public.convert_lead(p_company uuid, p_lead uuid, p_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.leads; cid uuid;
begin
 if not app_private.can_access(p_company,'crm','write') or not app_private.can_access(p_company,'clientes','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 select * into r from public.leads where company_id=p_company and id=p_lead for update;
 if not found then raise exception 'record_not_found'; end if;
 if r.customer_id is not null then return r.customer_id; end if;
 if p_version is null or r.version<>p_version then raise exception 'record_conflict' using errcode='PT409'; end if;
 if r.archived then raise exception 'lead_archived'; end if;
 cid:=gen_random_uuid();
 insert into public.customers(id,company_id,full_name,email,phone,address,city,postal_code,service,client_date,notes,created_by,updated_by)
 values(cid,p_company,r.full_name,r.email,r.phone,r.address,r.city,r.postal_code,r.service,
   (now() at time zone (select timezone from public.companies where id=p_company))::date,r.message,auth.uid(),auth.uid());
 update public.leads set customer_id=cid,status='CLIENTE',version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_lead;
 return cid;
end; $function$;

CREATE OR REPLACE FUNCTION public.create_client_share(p_company uuid, p_id uuid, p_kind text, p_target uuid, p_version integer, p_token text, p_days integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.estimates;cid uuid;snap jsonb;module text;
begin
 module:=case p_kind when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end;
 if module is null or not app_private.can_access(p_company,module,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_days is null or p_days not between 1 and 30 then raise exception 'invalid_share';end if;
 if p_kind='estimate' then
  if not app_private.can_access(p_company,'fin-estimados','read') then raise exception 'permission_denied' using errcode='42501';end if;
  select * into e from public.estimates where company_id=p_company and id=p_target for share;
  if not found or e.version is distinct from p_version or e.status not in ('BORRADOR','PENDIENTE','APROBADO') then raise exception 'record_conflict' using errcode='PT409';end if;
  cid:=e.customer_id;
  snap:=jsonb_build_object('number',e.number,'version',e.version,'customer',e.customer_snapshot->>'full_name','date',e.estimate_date,'valid_until',e.valid_until,'items',e.items,'subtotal',e.subtotal,'discount',e.discount,'taxes',e.taxes,'total',e.total,'currency',e.currency);
 else
  if not app_private.can_access(p_company,'clientes','read') or not app_private.can_access(p_company,'fin-invoices','read') or not app_private.can_access(p_company,'fin-proyectos','read') then raise exception 'permission_denied' using errcode='42501';end if;
  select id into cid from public.customers where company_id=p_company and id=p_target and status='active';if cid is null then raise exception 'customer_unavailable';end if;
 end if;
 insert into public.client_shares(id,company_id,kind,customer_id,estimate_id,estimate_version,snapshot,token_hash,expires_at,created_by,updated_by)
 values(p_id,p_company,p_kind,cid,case when p_kind='estimate' then e.id end,case when p_kind='estimate' then e.version end,snap,encode(sha256(convert_to(p_token,'UTF8')),'hex'),now()+make_interval(days=>p_days),auth.uid(),auth.uid());return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.decide_time_request(p_company uuid, p_id uuid, p_version integer, p_approve boolean, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare req public.time_requests;e public.time_entries;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into req from public.time_requests where company_id=p_company and id=p_id for update;
 if not found or p_version is null or req.version<>p_version or req.status<>'PENDIENTE' then raise exception 'record_conflict' using errcode='PT409';end if;
 if p_approve is null or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'reason_required';end if;
 if p_approve then
  select * into e from public.time_entries where company_id=p_company and id=req.entry_id;
  perform public.save_time_entry(p_company,e.id,req.entry_version,jsonb_build_object('worker_id',e.worker_id,'project_id',e.project_id,'starts_at',req.starts_at,'ends_at',req.ends_at,'break_minutes',req.break_minutes,'status','PENDIENTE','notes',e.notes,'reason','Solicitud '||req.id::text||': '||left(req.reason,1900)));
 end if;
 update public.time_requests set status=case when p_approve then 'APROBADA' else 'RECHAZADA' end,decision_note=p_note,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.design_to_estimate(p_company uuid, p_id uuid, p_version integer, p_estimate uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.designs;
begin
 select * into d from public.designs where company_id=p_company and id=p_id for update;
 if not found or not app_private.can_access(p_company,d.kind,'write') or not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if d.estimate_id is not null and d.estimate_design_version=d.version then return d.estimate_id;end if;
 if d.version is distinct from p_version or d.archived or p_estimate is null then raise exception 'record_conflict' using errcode='PT409';end if;
 perform public.save_estimate(p_company,p_estimate,0,jsonb_build_object('customer_id',d.customer_id,'estimate_date',current_date,'status','BORRADOR','notes',d.name||' · Diseño '||d.id||' revisión '||d.version,'discount','0','taxes','0','items',d.items));
 update public.designs set estimate_id=p_estimate,estimate_design_version=d.version,updated_by=auth.uid(),updated_at=now() where id=d.id;
 return p_estimate;
end;$function$;

CREATE OR REPLACE FUNCTION public.link_worker_login(p_company uuid, p_worker uuid, p_version integer, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 if nullif(trim(p_email),'') is not null then
  select m.user_id into uid from public.memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company and m.active and lower(u.email)=lower(trim(p_email));
  if uid is null then raise exception 'member_not_found';end if;
 end if;
 update public.workers set user_id=uid,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_worker and version=p_version;
 if not found then raise exception 'record_conflict' using errcode='PT409';end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.record_inventory_movement(p_company uuid, p_id uuid, p_item uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_version is null or item.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if item.status<>'ACTIVO' or q=0 then raise exception 'invalid_movement';end if;
 if proj is not null and rev is null and (not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=proj)) then raise exception 'project_unavailable';end if;
 if item.stock+q<0 then raise exception 'insufficient_stock';end if;
 insert into public.inventory_movements(id,company_id,item_id,project_id,movement_date,quantity,reason,reference,reversal_of,created_by) values(p_id,p_company,p_item,proj,dt,q,why,ref,rev,auth.uid());
 update public.work_records set stock=stock+q,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_item;
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.record_payment(p_company uuid, p_id uuid, p_invoice uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_version is null or i.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if i.status='VOID' then raise exception 'invoice_void';end if;
 if a>i.balance_due then raise exception 'overpayment';end if;
 insert into public.payments(id,company_id,invoice_id,payment_date,amount,method,reference,notes,created_by,updated_by)
 values(p_id,p_company,p_invoice,dt,a,mt,ref,nt,auth.uid(),auth.uid());
 perform app_private.recompute_invoice(p_company,p_invoice);
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.request_time_change(p_company uuid, p_id uuid, p_entry uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.time_entries;ts timestamptz;te timestamptz;br integer;why text;existing public.time_requests;
begin
 if not app_private.can_access(p_company,'horasfix','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 select * into e from public.time_entries where company_id=p_company and id=p_entry for update;
 if not found or (not app_private.is_manager(p_company) and not exists(select 1 from public.workers where company_id=p_company and id=e.worker_id and user_id=auth.uid() and active)) then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_data is null or octet_length(p_data::text)>5000 then raise exception 'invalid_request';end if;
 ts:=(p_data->>'starts_at')::timestamptz;te:=(p_data->>'ends_at')::timestamptz;br:=(p_data->>'break_minutes')::integer;why:=trim(p_data->>'reason');
 select * into existing from public.time_requests where company_id=p_company and id=p_id;
 if found then if (existing.entry_id,existing.starts_at,existing.ends_at,existing.break_minutes,existing.reason,existing.created_by) is not distinct from (p_entry,ts,te,br,why,auth.uid()) then return p_id;end if;raise exception 'request_conflict';end if;
 if p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);perform app_private.assert_time_open(p_company,ts,te);
 if e.status='ANULADO' or ts is null or te is null or br is null or why is null then raise exception 'invalid_request';end if;
 insert into public.time_requests(id,company_id,entry_id,entry_version,starts_at,ends_at,break_minutes,reason,created_by,updated_by) values(p_id,p_company,p_entry,p_version,ts,te,br,why,auth.uid(),auth.uid());
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.save_customer(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if affected<>1 then raise exception 'customer_conflict' using errcode='PT409'; end if;
  end if;
  return p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.save_design(p_company uuid, p_id uuid, p_version integer, p_kind text, p_data jsonb, p_refresh boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare oldrow public.designs;book public.price_books;r jsonb;s jsonb;cid uuid;k text;v numeric;total numeric:=0;items jsonb:='[]';line jsonb;roof text;wall text;rate numeric;qty numeric;label text;basis text;l numeric;w numeric;h numeric;pv integer;
begin
 if p_kind not in ('nuevo3d','pergolamotor') or p_kind is null or not app_private.can_access(p_company,p_kind,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_refresh is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'invalid_design';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into oldrow from public.designs where company_id=p_company and id=p_id for update;
 if coalesce(oldrow.version,0)<>p_version or (oldrow.id is not null and oldrow.kind<>p_kind) then raise exception 'record_conflict' using errcode='PT409';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 160 then raise exception 'invalid_name';end if;
 cid:=(p_data->>'customer_id')::uuid;
 if oldrow.id is null or oldrow.customer_id<>cid then
  if not app_private.can_access(p_company,'clientes','read') or not exists(select 1 from public.customers where company_id=p_company and id=cid and status='active') then raise exception 'customer_unavailable';end if;
 end if;
 s:=p_data->'spec';if s is null or jsonb_typeof(s)<>'object' then raise exception 'invalid_spec';end if;
 foreach k in array array['length','width','height','wall_length','wall_height','kitchen_length','heavy_count'] loop
  if coalesce(s->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' then raise exception 'invalid_dimension';end if;
  v:=(s->>k)::numeric;if v>200 or (k in ('length','width','height') and v<=0) or (k='heavy_count' and v<>trunc(v)) then raise exception 'invalid_dimension';end if;
 end loop;
 roof:=s->>'roof';wall:=s->>'wall';
 if roof is null or roof not in ('white','certified','composite') or wall is null or wall not in ('none','panel','composite') or coalesce(s->>'color','') not in ('white','bronze','black') or jsonb_typeof(s->'permit') is distinct from 'boolean' then raise exception 'invalid_options';end if;
 if wall<>'none' and ((s->>'wall_length')::numeric<=0 or (s->>'wall_height')::numeric<=0 or (s->>'wall_height')::numeric>(s->>'height')::numeric) then raise exception 'invalid_wall';end if;
 if oldrow.id is null or p_refresh then
  select * into book from public.price_books where company_id=p_company;
  if not found then raise exception 'prices_required';end if;r:=book.rates;pv:=book.version;
 else r:=oldrow.rate_snapshot;pv:=oldrow.price_version;end if;
 -- Normalize the snapshot: supplied totals and unknown fields are discarded.
 s:=jsonb_build_object('length',s->>'length','width',s->>'width','height',s->>'height','roof',roof,'wall',wall,'color',s->>'color','wall_length',s->>'wall_length','wall_height',s->>'wall_height','kitchen_length',s->>'kitchen_length','heavy_count',s->>'heavy_count','permit',(s->>'permit')::boolean);
 for k in select unnest(array['roof','wall','kitchen','heavy','permit']) loop
  l:=0;w:=0;h:=0;qty:=1;basis:='fixed';rate:=0;label:='';
  if k='roof' then basis:='area_ft2';l:=(s->>'length')::numeric;w:=(s->>'width')::numeric;rate:=(r->>('roof_'||roof))::numeric;label:='Pérgola '||roof;
  elsif k='wall' and wall<>'none' then basis:='area_ft2';l:=(s->>'wall_length')::numeric;w:=(s->>'wall_height')::numeric;rate:=(r->>('wall_'||wall))::numeric;label:='Pared '||wall;
  elsif k='kitchen' and (s->>'kitchen_length')::numeric>0 then basis:='linear_ft';l:=(s->>'kitchen_length')::numeric;rate:=(r->>'kitchen')::numeric;label:='Cocina exterior';
  elsif k='heavy' and (s->>'heavy_count')::numeric>0 then basis:='unit';qty:=(s->>'heavy_count')::numeric;rate:=(r->>'heavy_piece')::numeric;label:='Refuerzo por pieza';
  elsif k='permit' and (s->>'permit')::boolean then
   label:='Permiso';rate:=(r->>'permit_fixed')::numeric;
   if (s->>'length')::numeric*(s->>'width')::numeric>(r->>'permit_threshold')::numeric then basis:='area_ft2';l:=(s->>'length')::numeric;w:=(s->>'width')::numeric;rate:=(r->>'permit_area')::numeric;end if;
  end if;
  if label<>'' then
   v:=round(rate*qty*case when basis='area_ft2' then l*w when basis='linear_ft' then l else 1 end,2);total:=total+v;
   line:=jsonb_build_object('product_id',null,'name',label,'description','Tarifa versión '||pv,'base',basis,'unit_price',rate::text,'qty',qty::text,'length',l::text,'width',w::text,'height',h::text,'manual_total','0','line_total',v::text);items:=items||jsonb_build_array(line);
  end if;
 end loop;
 if oldrow.id is null then
  insert into public.designs(id,company_id,kind,name,customer_id,spec,rate_snapshot,price_version,items,total,created_by,updated_by) values(p_id,p_company,p_kind,trim(p_data->>'name'),cid,s,r,pv,items,total,auth.uid(),auth.uid());
 else update public.designs set name=trim(p_data->>'name'),customer_id=cid,spec=s,rate_snapshot=r,price_version=pv,items=items,total=total,archived=coalesce((p_data->>'archived')::boolean,false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.save_estimate(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.estimates;customer public.customers;item jsonb;normalized jsonb:='[]';
 price numeric;qty numeric;l numeric;w numeric;h numeric;amount numeric;sub numeric:=0;disc numeric;tax numeric;
 pid uuid;basis text;docnumber text;seq integer;yr integer;cid uuid;ed date;vd date;st text;notetext text;snapshot jsonb;key text;
begin
 if not app_private.can_access(p_company,'fin-estimados','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>200000 then raise exception 'invalid_estimate'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then
   select * into oldrow from public.estimates where company_id=p_company and id=p_id for update;
   if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409'; end if;
   if oldrow.status='ANULADA' then raise exception 'estimate_voided'; end if;
 end if;
 cid:=(p_data->>'customer_id')::uuid;ed:=(p_data->>'estimate_date')::date;vd:=nullif(p_data->>'valid_until','')::date;st:=p_data->>'status';notetext:=p_data->>'notes';
 if cid is null or ed is null or st is null or st not in ('BORRADOR','PENDIENTE','RECHAZADO','ANULADA') or notetext is null or length(notetext)>10000 or (vd is not null and vd<ed) then raise exception 'invalid_estimate'; end if;
 if p_version=0 or oldrow.customer_id<>cid then
   if not app_private.can_access(p_company,'clientes','read') then raise exception 'customer_access_required' using errcode='42501'; end if;
   select * into customer from public.customers where company_id=p_company and id=cid and status='active';
   if not found then raise exception 'customer_unavailable'; end if;
   snapshot:=jsonb_build_object('full_name',customer.full_name,'email',customer.email,'phone',customer.phone,'address',customer.address,'city',customer.city,'postal_code',customer.postal_code);
 else snapshot:=oldrow.customer_snapshot;end if;
 if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'invalid_items';end if;
 if jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'invalid_items';end if;
 for item in select value from jsonb_array_elements(p_data->'items') loop
   if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'name',''))) not between 1 and 255 or length(coalesce(item->>'description',''))>2000 then raise exception 'invalid_item';end if;
   basis:=item->>'base';if basis is null or basis not in ('area_ft2','linear_ft','volume_ft3','unit','fixed','manual') then raise exception 'invalid_basis';end if;
   foreach key in array array['unit_price','manual_total'] loop
     if coalesce(item->>key,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_money';end if;
   end loop;
   foreach key in array array['qty','length','width','height'] loop
     if coalesce(item->>key,'') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$' then raise exception 'invalid_dimension';end if;
   end loop;
   price:=(item->>'unit_price')::numeric;qty:=(item->>'qty')::numeric;l:=(item->>'length')::numeric;w:=(item->>'width')::numeric;h:=(item->>'height')::numeric;
   if qty<=0 or (basis in ('area_ft2','linear_ft','volume_ft3') and l<=0) or (basis in ('area_ft2','volume_ft3') and w<=0) or (basis='volume_ft3' and h<=0) then raise exception 'invalid_dimension';end if;
   pid:=nullif(item->>'product_id','')::uuid;
   if pid is not null then
     if not exists(select 1 from public.products where company_id=p_company and id=pid) then raise exception 'product_unavailable';end if;
     -- An existing line retains its historic reference after catalog access is revoked.
     if not exists(select 1 from jsonb_array_elements(coalesce(oldrow.items,'[]')) x where x->>'product_id'=pid::text)
       and (not app_private.can_access(p_company,'productos','read') or not exists(select 1 from public.products where company_id=p_company and id=pid and active)) then raise exception 'product_access_required' using errcode='42501';end if;
   end if;
   amount:=round(case basis when 'area_ft2' then price*qty*l*w when 'linear_ft' then price*qty*l when 'volume_ft3' then price*qty*l*w*h when 'manual' then (item->>'manual_total')::numeric else price*qty end,2);
   sub:=sub+amount;if sub>999999999999.99 then raise exception 'amount_too_large';end if;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('product_id',pid,'name',trim(item->>'name'),'description',coalesce(item->>'description',''),'base',basis,'unit_price',price::text,'qty',qty::text,'length',l::text,'width',w::text,'height',h::text,'manual_total',(item->>'manual_total')::numeric::text,'line_total',amount::text));
 end loop;
 foreach key in array array['discount','taxes'] loop
   if coalesce(p_data->>key,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_money';end if;
 end loop;
 disc:=(p_data->>'discount')::numeric;tax:=(p_data->>'taxes')::numeric;
 if disc>sub or sub-disc+tax>999999999999.99 then raise exception 'invalid_total';end if;
 if p_version=0 then
   yr:=extract(year from ed)::integer;
   insert into app_private.document_counters as counters(company_id,kind,year,value) values(p_company,'EST',yr,1)
   on conflict(company_id,kind,year) do update set value=counters.value+1 returning value into seq;
   docnumber:='EST-'||yr::text||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0');
   insert into public.estimates(id,company_id,number,customer_id,customer_snapshot,estimate_date,valid_until,status,notes,items,subtotal,discount,taxes,total,created_by,updated_by)
   values(p_id,p_company,docnumber,cid,snapshot,ed,vd,st,notetext,normalized,sub,disc,tax,sub-disc+tax,auth.uid(),auth.uid());
 else
   update public.estimates set customer_id=cid,customer_snapshot=snapshot,estimate_date=ed,valid_until=vd,status=st,notes=notetext,items=normalized,subtotal=sub,discount=disc,taxes=tax,total=sub-disc+tax,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.save_expense(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.expenses;proj uuid;worker uuid;dt date;cat text;descr text;ven text;doc text;a numeric;mt text;rs text;st text;dn text;changed boolean;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>15000 then raise exception 'invalid_expense';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then select * into oldrow from public.expenses where company_id=p_company and id=p_id for update;if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION public.save_lead(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.leads; r public.leads;
begin
 if not app_private.can_access(p_company,'crm','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_lead'; end if;
 select * into r from jsonb_populate_record(null::public.leads,p_data);
 if p_version>0 then
   select * into oldrow from public.leads where company_id=p_company and id=p_id for update;
   if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409'; end if;
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
end; $function$;

CREATE OR REPLACE FUNCTION public.save_price_book(p_company uuid, p_version integer, p_rates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k text;r jsonb:='{}';oldrow public.price_books;
begin
 if not app_private.can_access(p_company,'adm-precios','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_version is null or p_version<0 or p_rates is null or jsonb_typeof(p_rates)<>'object' or octet_length(p_rates::text)>10000 then raise exception 'invalid_rates';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':prices',0));
 select * into oldrow from public.price_books where company_id=p_company for update;
 if coalesce(oldrow.version,0)<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 foreach k in array array['roof_white','roof_certified','roof_composite','wall_panel','wall_composite','kitchen','permit_fixed','permit_threshold','permit_area','heavy_piece'] loop
  if coalesce(p_rates->>k,'') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then raise exception 'invalid_rate_%',k;end if;
  r:=r||jsonb_build_object(k,(p_rates->>k)::numeric::text);
 end loop;
 if (r->>'roof_white')::numeric<=0 or (r->>'roof_certified')::numeric<=0 or (r->>'roof_composite')::numeric<=0 then raise exception 'positive_roof_rate_required';end if;
 if p_version=0 then
  insert into public.price_books(id,company_id,rates,created_by,updated_by) values(gen_random_uuid(),p_company,r,auth.uid(),auth.uid());
 else update public.price_books set rates=r,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company;end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.save_product(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   if not found or oldversion<>p_version then raise exception 'record_conflict' using errcode='PT409'; end if;
   update public.products set name=trim(r.name),category=trim(r.category),base=r.base,unit_price=r.unit_price,specs=r.specs,options=r.options,active=r.active,
     version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_id;
 end if;
 return p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.save_time_entry(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.time_entries;worker uuid;proj uuid;ts timestamptz;te timestamptz;br integer;st text;nt text;why text;
begin
 if not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or octet_length(p_data::text)>6000 then raise exception 'invalid_time';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':hours',0));
 if p_version>0 then select * into e from public.time_entries where company_id=p_company and id=p_id for update;if not found or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;perform app_private.assert_time_open(p_company,e.starts_at,e.ends_at);end if;
 worker:=(p_data->>'worker_id')::uuid;proj:=nullif(p_data->>'project_id','')::uuid;ts:=(p_data->>'starts_at')::timestamptz;te:=nullif(p_data->>'ends_at','')::timestamptz;br:=(p_data->>'break_minutes')::integer;st:=p_data->>'status';nt:=coalesce(p_data->>'notes','');why:=trim(p_data->>'reason');
 if worker is null or ts is null or te is null or te<=ts or te-ts>interval '7 days' or br is null or br<0 or br>floor(extract(epoch from (te-ts))/60) or st is null or st not in ('PENDIENTE','APROBADO','ANULADO') or length(nt)>2000 or why is null or length(why) not between 3 and 2000 then raise exception 'invalid_time';end if;
 if not exists(select 1 from public.workers where company_id=p_company and id=worker and (active or (p_version>0 and worker=e.worker_id))) then raise exception 'worker_unavailable';end if;
 if proj is not null and not exists(select 1 from public.projects where company_id=p_company and id=proj) then raise exception 'project_unavailable';end if;
 perform app_private.assert_time_open(p_company,ts,te);
 if st<>'ANULADO' and exists(select 1 from public.time_entries t where t.company_id=p_company and t.worker_id=worker and t.id<>p_id and t.status<>'ANULADO' and t.starts_at<te and coalesce(t.ends_at,'infinity')>ts) then raise exception 'time_overlap';end if;
 if p_version>0 and e.status='APROBADO' and (worker,proj,ts,te,br) is distinct from (e.worker_id,e.project_id,e.starts_at,e.ends_at,e.break_minutes) and st<>'ANULADO' then st:='PENDIENTE';end if;
 if p_version=0 then insert into public.time_entries(id,company_id,worker_id,project_id,starts_at,ends_at,break_minutes,status,notes,source,reason,created_by,updated_by) values(p_id,p_company,worker,proj,ts,te,br,st,nt,'MANUAL',why,auth.uid(),auth.uid());
 else update public.time_entries set worker_id=worker,project_id=proj,starts_at=ts,ends_at=te,break_minutes=br,status=st,notes=nt,reason=why,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.save_work_record(p_company uuid, p_id uuid, p_version integer, p_kind text, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.work_records; nm text;st text;proj uuid;worker uuid;d jsonb;changed boolean;ts timestamptz;te timestamptz;
begin
 if app_private.work_module(p_kind) is null or not app_private.can_access(p_company,app_private.work_module(p_kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>65000 then raise exception 'invalid_record';end if;
 -- Serialize schedule validation within a company, including changing the assigned worker.
 if p_kind='installations' then perform pg_advisory_xact_lock(hashtextextended(p_company::text||':installations',0));end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then
  select * into oldrow from public.work_records where company_id=p_company and id=p_id and kind=p_kind for update;
  if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION public.save_worker(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.workers;nm text;em text;ph text;jt text;tm text;rate numeric;target integer;act boolean;nt text;
begin
 if not app_private.can_access(p_company,'trabajadores','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'invalid_worker';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then select * into oldrow from public.workers where company_id=p_company and id=p_id for update;if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;end if;
 if coalesce(p_data->>'hourly_rate','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or coalesce(p_data->>'weekly_target','') !~ '^[0-9]{1,3}$' or jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'invalid_worker';end if;
 nm:=trim(p_data->>'name');em:=coalesce(p_data->>'email','');ph:=coalesce(p_data->>'phone','');jt:=coalesce(p_data->>'job_title','');tm:=coalesce(p_data->>'team','');rate:=(p_data->>'hourly_rate')::numeric;target:=(p_data->>'weekly_target')::integer;act:=(p_data->>'active')::boolean;nt:=coalesce(p_data->>'notes','');
 if nm is null or length(nm) not between 2 and 190 or length(em)>254 or length(ph)>64 or length(jt)>128 or length(tm)>128 or target>168 or length(nt)>10000 then raise exception 'invalid_worker';end if;
 if p_version=0 then insert into public.workers(id,company_id,name,email,phone,job_title,team,hourly_rate,weekly_target,active,notes,created_by,updated_by) values(p_id,p_company,nm,em,ph,jt,tm,rate,target,act,nt,auth.uid(),auth.uid());
 else update public.workers set name=nm,email=em,phone=ph,job_title=jt,team=tm,hourly_rate=rate,weekly_target=target,active=act,notes=nt,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.set_expense_receipt(p_company uuid, p_id uuid, p_version integer, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.expenses;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.expenses where company_id=p_company and id=p_id for update;
 if not found or p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if e.status='ANULADO' and not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_path is not null and (not app_private.expense_receipt_access(p_path,'write') or split_part(p_path,'/',1)<>p_company::text or split_part(p_path,'/',2)<>p_id::text or not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=p_path)) then raise exception 'invalid_receipt';end if;
 update public.expenses set receipt_path=p_path,status=case when status in ('APROBADO','RECHAZADO') then 'PENDIENTE' else status end,decision_note=case when status in ('APROBADO','RECHAZADO') then 'Recibo corregido; requiere nueva revisión.' else decision_note end,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.set_product_image(p_company uuid, p_product uuid, p_version integer, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer;
begin
 if not app_private.can_access(p_company,'productos','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 select version into v from public.products where company_id=p_company and id=p_product for update;
 if not found or p_version is null or v<>p_version then raise exception 'record_conflict' using errcode='PT409'; end if;
 if p_path is not null then
   if not app_private.product_image_access(p_path,'write') or split_part(p_path,'/',1)<>p_company::text or split_part(p_path,'/',2)<>p_product::text
     or not exists(select 1 from storage.objects where bucket_id='product-images' and name=p_path) then raise exception 'invalid_image'; end if;
 end if;
 update public.products set image_path=p_path,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_product;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_work_attachment(p_company uuid, p_record uuid, p_record_version integer, p_id uuid, p_path text, p_name text, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.work_records;f public.work_attachments;
begin
 select * into r from public.work_records where company_id=p_company and id=p_record for update;
 if not found or not app_private.can_access(p_company,app_private.work_module(r.kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_record_version is null or r.version<>p_record_version then raise exception 'record_conflict' using errcode='PT409';end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION public.update_invoice(p_company uuid, p_id uuid, p_version integer, p_date date, p_due date, p_notes text, p_void_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.invoices;
begin
 if not app_private.can_access(p_company,'fin-invoices','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into i from public.invoices where company_id=p_company and id=p_id for update;
 if not found or p_version is null or i.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION public.update_project(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects;st text;nm text;sd date;ed date;nt text;
begin
 if not app_private.can_access(p_company,'fin-proyectos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_project';end if;
 -- Lock financial parent first so scheduling cannot race with a payment reversal.
 perform 1 from public.invoices where company_id=p_company and project_id=p_id for update;
 select * into p from public.projects where company_id=p_company and id=p_id for update;
 if not found or p_version is null or p.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 nm:=p_data->>'name';st:=p_data->>'status';sd:=nullif(p_data->>'start_date','')::date;ed:=nullif(p_data->>'end_date','')::date;nt:=p_data->>'notes';
 if nm is null or length(trim(nm)) not between 2 and 255 or st is null or st not in ('NUEVO','PENDIENTE','PLANIFICACION','PRODUCCION','INSTALACION','COMPLETADO','CANCELADO') or nt is null or length(nt)>10000 or (sd is not null and ed is not null and ed<sd) then raise exception 'invalid_project';end if;
 if (st in ('PRODUCCION','INSTALACION','COMPLETADO') and st<>p.status) or (sd is not null and sd is distinct from p.start_date) then
  if not exists(select 1 from public.invoices where company_id=p_company and project_id=p_id and status='OPEN' and paid_amount>0) then raise exception 'deposit_required';end if;
 end if;
 update public.projects set name=trim(nm),status=st,start_date=sd,end_date=ed,notes=nt,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.void_payment(p_company uuid, p_id uuid, p_version integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_version is null or p.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 update public.payments set status='VOID',void_reason=trim(p_reason),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
 perform app_private.recompute_invoice(p_company,iid);
end;$function$;


commit;
