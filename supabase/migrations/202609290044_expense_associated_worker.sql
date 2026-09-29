-- ADT current: an associated worker is optional when the company pays.
-- Preserve tenant/active-worker checks and paid-reimbursement locks; no backfill.
begin;
alter table public.expenses drop constraint expenses_payer_relation;
alter table public.expenses add constraint expenses_payer_relation check(payer is null or
 (payer='TRABAJADOR' and worker_id is not null and reimbursement_status<>'NO_APLICA') or
 (payer in ('EMPRESA','EFECTIVO_EMPRESA') and reimbursement_status='NO_APLICA'));
CREATE OR REPLACE FUNCTION public.save_expense(p_company uuid, p_id uuid, p_version integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare oldrow public.expenses;proj uuid;worker uuid;dt date;cat text;descr text;ven text;doc text;a numeric;mt text;rs text;st text;dn text;changed boolean;pay text;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_version is null or p_version<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>15000 then raise exception 'invalid_expense';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if p_version>0 then select * into oldrow from public.expenses where company_id=p_company and id=p_id for update;if not found or oldrow.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;end if;
 proj:=nullif(p_data->>'project_id','')::uuid;worker:=nullif(p_data->>'worker_id','')::uuid;
 pay:=case when p_data ? 'payer' then nullif(p_data->>'payer','') else oldrow.payer end;
 if (pay is not null and pay not in ('EMPRESA','EFECTIVO_EMPRESA','TRABAJADOR')) or (oldrow.payer is not null and pay is null) then raise exception 'invalid_payer';end if;
 if pay='TRABAJADOR' and worker is null then raise exception 'worker_required';end if;
 if proj is not null and (p_version=0 or proj is distinct from oldrow.project_id) then
  if not app_private.can_access(p_company,'fin-proyectos','read') or not exists(select 1 from public.projects where company_id=p_company and id=proj) then raise exception 'project_unavailable';end if;
 end if;
 if worker is not null and (p_version=0 or worker is distinct from oldrow.worker_id) then
  if not app_private.can_access(p_company,'trabajadores','read') or not exists(select 1 from public.workers where company_id=p_company and id=worker and active) then raise exception 'worker_unavailable';end if;
 end if;
 if coalesce(p_data->>'amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'invalid_amount';end if;
 dt:=(p_data->>'expense_date')::date;cat:=trim(p_data->>'category');descr:=coalesce(p_data->>'description','');ven:=trim(coalesce(p_data->>'vendor',''));doc:=trim(coalesce(p_data->>'document_number',''));a:=(p_data->>'amount')::numeric;mt:=p_data->>'method';rs:=p_data->>'reimbursement_status';st:=p_data->>'status';dn:=coalesce(p_data->>'decision_note','');
 if pay in ('EMPRESA','EFECTIVO_EMPRESA') then rs:='NO_APLICA';
 elsif pay='TRABAJADOR' and rs='NO_APLICA' then rs:='PENDIENTE';end if;
 if dt is null or cat is null or length(cat) not between 1 and 64 or length(descr)>2000 or length(ven)>190 or length(doc)>100 or a<=0 or mt is null or mt not in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','ZELLE','OTRO') or rs is null or rs not in ('NO_APLICA','PENDIENTE','REEMBOLSADO') or (rs<>'NO_APLICA' and worker is null) or st is null or st not in ('PENDIENTE','APROBADO','RECHAZADO','ANULADO') or length(dn)>2000 then raise exception 'invalid_expense';end if;
 if st in ('RECHAZADO','ANULADO') and length(trim(dn))<3 then raise exception 'reason_required';end if;
 changed:=p_version>0 and (proj,worker,dt,cat,descr,ven,doc,a,mt,pay) is distinct from (oldrow.project_id,oldrow.worker_id,oldrow.expense_date,oldrow.category,oldrow.description,oldrow.vendor,oldrow.document_number,oldrow.amount,oldrow.method,oldrow.payer);
 if not app_private.is_manager(p_company) then
  if p_version>0 and oldrow.status='ANULADO' then raise exception 'manager_required' using errcode='42501';end if;
  if (st in ('APROBADO','RECHAZADO','ANULADO') and (p_version=0 or st is distinct from oldrow.status)) or (rs='REEMBOLSADO' and (p_version=0 or rs is distinct from oldrow.reimbursement_status)) or (p_version>0 and dn is distinct from oldrow.decision_note) then raise exception 'manager_required' using errcode='42501';end if;
 end if;
 -- Editing approved/rejected financial data always requires a new review, even by an administrator.
 -- ADT requires accounting reversal before changing an already reimbursed payer,
 -- worker or amount, cancelling it, or removing its paid reimbursement state.
 if p_version>0 and oldrow.reimbursement_status='REEMBOLSADO' and
 ((a,worker,pay) is distinct from (oldrow.amount,oldrow.worker_id,oldrow.payer) or st='ANULADO' or rs<>'REEMBOLSADO') then
  raise exception 'reimbursed_expense_locked' using errcode='PT409';end if;
 if changed and oldrow.status in ('APROBADO','RECHAZADO') then st:='PENDIENTE';dn:='Datos corregidos; requiere nueva revisión.';end if;
 if p_version=0 then insert into public.expenses(id,company_id,project_id,worker_id,expense_date,category,description,vendor,document_number,amount,method,reimbursement_status,status,decision_note,payer,created_by,updated_by) values(p_id,p_company,proj,worker,dt,cat,descr,ven,doc,a,mt,rs,st,dn,pay,auth.uid(),auth.uid());
 else update public.expenses set project_id=proj,worker_id=worker,expense_date=dt,category=cat,description=descr,vendor=ven,document_number=doc,amount=a,method=mt,reimbursement_status=rs,status=st,decision_note=dn,payer=pay,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;end if;
 return p_id;
end;$function$;
notify pgrst,'reload schema';
commit;
