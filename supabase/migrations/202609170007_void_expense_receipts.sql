begin;
-- Apply the same manager restriction to receipt changes and expense edits.
create or replace function public.set_expense_receipt(p_company uuid,p_id uuid,p_version integer,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare e public.expenses;
begin
 if not app_private.can_access(p_company,'gastos','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into e from public.expenses where company_id=p_company and id=p_id for update;
 if not found or p_version is null or e.version<>p_version then raise exception 'record_conflict' using errcode='40001';end if;
 if e.status='ANULADO' and not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
 if p_path is not null and (not app_private.expense_receipt_access(p_path,'write') or split_part(p_path,'/',1)<>p_company::text or split_part(p_path,'/',2)<>p_id::text or not exists(select 1 from storage.objects where bucket_id='expense-receipts' and name=p_path)) then raise exception 'invalid_receipt';end if;
 update public.expenses set receipt_path=p_path,status=case when status in ('APROBADO','RECHAZADO') then 'PENDIENTE' else status end,decision_note=case when status in ('APROBADO','RECHAZADO') then 'Recibo corregido; requiere nueva revisión.' else decision_note end,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id;
end;$$;
revoke all on function public.set_expense_receipt(uuid,uuid,integer,text) from public,anon;
grant execute on function public.set_expense_receipt(uuid,uuid,integer,text) to authenticated;
commit;
