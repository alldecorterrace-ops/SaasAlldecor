-- Add Zelle to invoice records. No payment is executed and no existing row is changed.
begin;
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
 check(method in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','ZELLE','OTRO'));

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
 if a<=0 or dt is null or mt is null or mt not in ('EFECTIVO','CHEQUE','TRANSFERENCIA','TARJETA_EXTERNA','ZELLE','OTRO') or length(ref)>255 or length(nt)>2000 then raise exception 'invalid_payment';end if;
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
commit;
