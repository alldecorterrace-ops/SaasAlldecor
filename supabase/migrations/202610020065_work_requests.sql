-- Durable operational writes; no business imports or destructive changes.
begin;
create table app_private.work_requests (
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(company_id,actor_id,request_id)
);
alter table app_private.work_requests enable row level security;
revoke all on app_private.work_requests from public,anon,authenticated;

-- Keep the rules already implemented and the legacy signatures for code rollback.
-- Only the authenticated dispatcher may invoke these private implementations.
alter function public.save_work_record(uuid,uuid,integer,text,jsonb) set schema app_private;
alter function app_private.save_work_record(uuid,uuid,integer,text,jsonb) rename to apply_work_record;
alter function public.record_inventory_movement(uuid,uuid,uuid,integer,jsonb) set schema app_private;
alter function app_private.record_inventory_movement(uuid,uuid,uuid,integer,jsonb) rename to apply_inventory_movement;
alter function public.set_work_attachment(uuid,uuid,integer,uuid,text,text,boolean) set schema app_private;
alter function app_private.set_work_attachment(uuid,uuid,integer,uuid,text,text,boolean) rename to apply_work_attachment;
revoke all on function app_private.apply_work_record(uuid,uuid,integer,text,jsonb),
 app_private.apply_inventory_movement(uuid,uuid,uuid,integer,jsonb),
 app_private.apply_work_attachment(uuid,uuid,integer,uuid,text,text,boolean)
 from public,anon,authenticated;

create function public.execute_work_action(p_company uuid,p_request uuid,p_operation text,p_kind text,p_id uuid,p_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior app_private.work_requests;payload jsonb;result jsonb;effect uuid;record public.work_records;module text;
begin
 module:=app_private.work_module(p_kind);
 if auth.uid() is null or module is null or not app_private.can_access(p_company,module,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_request is null or p_id is null or p_version is null or p_version<0 or p_operation is null
 or p_operation not in ('save','movement','attachment') or (p_operation='movement' and p_kind<>'inventory')
 or (p_operation<>'save' and p_version<1) or p_data is null or jsonb_typeof(p_data)<>'object'
 or octet_length(p_data::text)>65000 then raise exception 'invalid_work_request' using errcode='22023';end if;
 payload:=jsonb_build_object('operation',p_operation,'kind',p_kind,'id',p_id,'version',p_version,'data',p_data);
 -- One order for save, movement and attachment avoids cross-operation deadlocks.
 -- A revocation may commit while this lock is awaited; verify it afterwards.
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':work-actions',0));
 perform 1 from public.memberships where company_id=p_company and user_id=auth.uid() and active for share;
 if not found or not app_private.can_access(p_company,module,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into prior from app_private.work_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if found then
  if prior.payload<>payload then raise exception 'request_conflict' using errcode='PT409';end if;
  return prior.result;
 end if;
 if p_version>0 then
  select * into record from public.work_records where company_id=p_company and id=p_id and kind=p_kind for update;
  if not found or record.version<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 end if;
 if p_operation='save' then
  -- ADT's current permit cancellation is an administrator action.
  if p_kind='permits' and (p_data->>'status'='ANULADO' or record.status='ANULADO') and not app_private.is_manager(p_company) then raise exception 'manager_required' using errcode='42501';end if;
  effect:=app_private.apply_work_record(p_company,p_id,p_version,p_kind,p_data);
 elsif p_operation='movement' then
  effect:=app_private.apply_inventory_movement(p_company,(p_data->>'movement_id')::uuid,p_id,p_version,p_data-'movement_id');
 else
  if jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'invalid_work_request';end if;
  effect:=(p_data->>'attachment_id')::uuid;
  perform app_private.apply_work_attachment(p_company,p_id,p_version,effect,p_data->>'path',p_data->>'name',(p_data->>'active')::boolean);
 end if;
 select * into record from public.work_records where company_id=p_company and id=p_id and kind=p_kind;
 result:=jsonb_build_object('id',effect,'recordId',p_id,'version',record.version,'operation',p_operation,'kind',p_kind,'status',record.status);
 insert into app_private.work_requests(company_id,actor_id,request_id,payload,result) values(p_company,auth.uid(),p_request,payload,result);
 return result;
end;$$;
revoke all on function public.execute_work_action(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.execute_work_action(uuid,uuid,text,text,uuid,integer,jsonb) to authenticated;

create function public.work_request_result(p_company uuid,p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt app_private.work_requests;
begin
 select * into receipt from app_private.work_requests where company_id=p_company and actor_id=auth.uid() and request_id=p_request;
 if not found then
  if auth.uid() is null or not app_private.is_member(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
  return null;
 end if;
 if not app_private.can_access(p_company,app_private.work_module(receipt.payload->>'kind'),'read') then raise exception 'permission_denied' using errcode='42501';end if;
 return receipt.result;
end;$$;
revoke all on function public.work_request_result(uuid,uuid) from public,anon;
grant execute on function public.work_request_result(uuid,uuid) to authenticated;

create function public.save_work_record(p_company uuid,p_id uuid,p_version integer,p_kind text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
 receipt:=public.execute_work_action(p_company,md5('legacy-save:'||coalesce(auth.uid()::text,'')||':'||coalesce(p_id::text,'')||':'||coalesce(p_version::text,''))::uuid,'save',p_kind,p_id,p_version,p_data);
 return (receipt->>'id')::uuid;
end;$$;
create function public.record_inventory_movement(p_company uuid,p_id uuid,p_item uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
 receipt:=public.execute_work_action(p_company,p_id,'movement','inventory',p_item,p_version,p_data||jsonb_build_object('movement_id',p_id));
 return (receipt->>'id')::uuid;
end;$$;
create function public.set_work_attachment(p_company uuid,p_record uuid,p_record_version integer,p_id uuid,p_path text,p_name text,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.execute_work_action(p_company,md5('legacy-attachment:'||coalesce(auth.uid()::text,'')||':'||coalesce(p_record::text,'')||':'||coalesce(p_record_version::text,'')||':'||coalesce(p_id::text,''))::uuid,'attachment',(select kind from public.work_records where company_id=p_company and id=p_record),p_record,p_record_version,jsonb_build_object('attachment_id',p_id,'path',p_path,'name',p_name,'active',p_active));
end;$$;
revoke all on function public.save_work_record(uuid,uuid,integer,text,jsonb),public.record_inventory_movement(uuid,uuid,uuid,integer,jsonb),public.set_work_attachment(uuid,uuid,integer,uuid,text,text,boolean) from public,anon;
grant execute on function public.save_work_record(uuid,uuid,integer,text,jsonb),public.record_inventory_movement(uuid,uuid,uuid,integer,jsonb),public.set_work_attachment(uuid,uuid,integer,uuid,text,text,boolean) to authenticated;
commit;
