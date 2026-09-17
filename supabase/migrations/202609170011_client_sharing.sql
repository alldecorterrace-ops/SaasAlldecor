-- Revocable customer-scoped access and immutable web estimate snapshots.
begin;
create table public.client_shares(
 id uuid primary key,company_id uuid not null references public.companies(id),kind text not null check(kind in ('estimate','portal')),
 customer_id uuid not null,estimate_id uuid,estimate_version integer,snapshot jsonb,
 token_hash text not null unique,expires_at timestamptz not null,revoked boolean not null default false,
 response text check(response in ('ACCEPTED','CHANGES')),respondent text,response_note text,responded_at timestamptz,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,customer_id) references public.customers(company_id,id),foreign key(company_id,estimate_id) references public.estimates(company_id,id),
 check((kind='estimate' and estimate_id is not null and snapshot is not null) or (kind='portal' and estimate_id is null and snapshot is null))
);
create index client_shares_company on public.client_shares(company_id,kind,created_at desc,id);
alter table public.client_shares enable row level security;
revoke all on public.client_shares from anon,authenticated;
grant select on public.client_shares to authenticated;
create policy shares_read on public.client_shares for select to authenticated using(app_private.can_access(company_id,case kind when 'estimate' then 'estimadosweb' else 'portal' end,'read'));
create trigger shares_audit after insert or update on public.client_shares for each row execute function app_private.audit_change();

create function public.create_client_share(p_company uuid,p_id uuid,p_kind text,p_target uuid,p_version integer,p_token text,p_days integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.estimates;cid uuid;snap jsonb;module text;
begin
 module:=case p_kind when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end;
 if module is null or not app_private.can_access(p_company,module,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_days is null or p_days not between 1 and 30 then raise exception 'invalid_share';end if;
 if p_kind='estimate' then
  if not app_private.can_access(p_company,'fin-estimados','read') then raise exception 'permission_denied' using errcode='42501';end if;
  select * into e from public.estimates where company_id=p_company and id=p_target for share;
  if not found or e.version is distinct from p_version or e.status not in ('BORRADOR','PENDIENTE','APROBADO') then raise exception 'record_conflict' using errcode='40001';end if;
  cid:=e.customer_id;
  snap:=jsonb_build_object('number',e.number,'version',e.version,'customer',e.customer_snapshot->>'full_name','date',e.estimate_date,'valid_until',e.valid_until,'items',e.items,'subtotal',e.subtotal,'discount',e.discount,'taxes',e.taxes,'total',e.total,'currency',e.currency);
 else
  if not app_private.can_access(p_company,'clientes','read') or not app_private.can_access(p_company,'fin-invoices','read') or not app_private.can_access(p_company,'fin-proyectos','read') then raise exception 'permission_denied' using errcode='42501';end if;
  select id into cid from public.customers where company_id=p_company and id=p_target and status='active';if cid is null then raise exception 'customer_unavailable';end if;
 end if;
 insert into public.client_shares(id,company_id,kind,customer_id,estimate_id,estimate_version,snapshot,token_hash,expires_at,created_by,updated_by)
 values(p_id,p_company,p_kind,cid,case when p_kind='estimate' then e.id end,case when p_kind='estimate' then e.version end,snap,encode(sha256(convert_to(p_token,'UTF8')),'hex'),now()+make_interval(days=>p_days),auth.uid(),auth.uid());return p_id;
end;$$;
create function public.revoke_client_share(p_company uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.client_shares;
begin
 select * into s from public.client_shares where company_id=p_company and id=p_id for update;
 if not found or not app_private.can_access(p_company,case s.kind when 'estimate' then 'estimadosweb' else 'portal' end,'write') then raise exception 'permission_denied' using errcode='42501';end if;
 update public.client_shares set revoked=true,updated_by=auth.uid(),updated_at=now() where id=p_id and not revoked;
end;$$;
create function public.read_client_share(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.client_shares;c text;invs jsonb;projs jsonb;active boolean;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into s from public.client_shares where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and not revoked and expires_at>now();
 if not found then return null;end if;
 -- Removing the issuing user's authority invalidates their outstanding links.
 if not exists(select 1 from public.memberships m where m.company_id=s.company_id and m.user_id=s.created_by and m.active and (m.role in ('owner','admin') or (coalesce(m.permissions->case s.kind when 'estimate' then 'estimadosweb' else 'portal' end ? 'write',false) and case s.kind when 'estimate' then coalesce(m.permissions->'fin-estimados' ?| array['read','write'],false) else coalesce(m.permissions->'clientes' ?| array['read','write'],false) and coalesce(m.permissions->'fin-invoices' ?| array['read','write'],false) and coalesce(m.permissions->'fin-proyectos' ?| array['read','write'],false) end))) then return null;end if;
 select name into c from public.companies where id=s.company_id;
 if s.kind='estimate' then
  select version=s.estimate_version and status in ('BORRADOR','PENDIENTE') and (valid_until is null or valid_until>=(now() at time zone (select timezone from public.companies where id=s.company_id))::date) into active from public.estimates where company_id=s.company_id and id=s.estimate_id;
  return jsonb_build_object('kind',s.kind,'company',c,'document',s.snapshot,'response',s.response,'response_note',s.response_note,'respondent',s.respondent,'can_respond',coalesce(active,false) and s.response is null);
 end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into invs from (select number,invoice_date,due_date,total,paid_amount,balance_due,payment_status from public.invoices where company_id=s.company_id and customer_id=s.customer_id order by invoice_date desc,id limit 100) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into projs from (select name,status,project_date,start_date,end_date from public.projects where company_id=s.company_id and customer_id=s.customer_id order by project_date desc,id limit 100) x;
 return jsonb_build_object('kind',s.kind,'company',c,'customer',(select full_name from public.customers where company_id=s.company_id and id=s.customer_id),'invoices',invs,'projects',projs);
end;$$;
create function public.respond_client_share(p_token text,p_response text,p_name text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare s public.client_shares;e public.estimates;tz text;
begin
 if public.read_client_share(p_token) is null then raise exception 'share_unavailable';end if;
 select * into s from public.client_shares where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if s.kind<>'estimate' or s.revoked or s.expires_at<=now() then raise exception 'share_unavailable';end if;
 if p_response is null or p_response not in ('ACCEPTED','CHANGES') or p_name is null or length(trim(p_name)) not between 2 and 160 or p_note is null or length(p_note)>2000 then raise exception 'invalid_response';end if;
 if s.response is not null then
  if s.response=p_response and s.respondent=trim(p_name) and s.response_note=p_note then return;end if;raise exception 'response_already_recorded';
 end if;
 select * into e from public.estimates where company_id=s.company_id and id=s.estimate_id for share;
 select timezone into tz from public.companies where id=s.company_id;
 if e.version<>s.estimate_version or e.status not in ('BORRADOR','PENDIENTE') or (e.valid_until is not null and e.valid_until<(now() at time zone tz)::date) then raise exception 'estimate_changed_or_expired';end if;
 update public.client_shares set response=p_response,respondent=trim(p_name),response_note=p_note,responded_at=now(),updated_at=now() where id=s.id;
 -- This records the holder's response. Financial approval remains an internal action.
end;$$;
revoke all on function public.create_client_share(uuid,uuid,text,uuid,integer,text,integer),public.revoke_client_share(uuid,uuid),public.read_client_share(text),public.respond_client_share(text,text,text,text) from public;
grant execute on function public.create_client_share(uuid,uuid,text,uuid,integer,text,integer),public.revoke_client_share(uuid,uuid) to authenticated;
grant execute on function public.read_client_share(text),public.respond_client_share(text,text,text,text) to anon,authenticated;
commit;
