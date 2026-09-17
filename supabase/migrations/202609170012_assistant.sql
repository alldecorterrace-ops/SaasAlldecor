begin;
create table public.assistant_settings(id uuid primary key,company_id uuid not null unique references public.companies(id),enabled boolean not null default false,daily_limit integer not null default 20 check(daily_limit between 1 and 100),updated_at timestamptz not null default now());
create table public.assistant_usage(id uuid primary key,company_id uuid not null references public.companies(id),user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index assistant_usage_window on public.assistant_usage(company_id,created_at desc);
alter table public.assistant_settings enable row level security;alter table public.assistant_usage enable row level security;
revoke all on public.assistant_settings,public.assistant_usage from anon,authenticated;
grant select on public.assistant_settings,public.assistant_usage to authenticated;
create policy assistant_settings_read on public.assistant_settings for select to authenticated using(app_private.can_access(company_id,'ia','read'));
create policy assistant_usage_read on public.assistant_usage for select to authenticated using(app_private.can_access(company_id,'ia','read') and (user_id=auth.uid() or app_private.is_manager(company_id)));
create trigger assistant_settings_audit after insert or update on public.assistant_settings for each row execute function app_private.audit_change();
create function public.configure_assistant(p_company uuid,p_enabled boolean,p_limit integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501';end if;
 if p_enabled is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_settings';end if;
 insert into public.assistant_settings(id,company_id,enabled,daily_limit) values(p_company,p_company,p_enabled,p_limit) on conflict(company_id) do update set enabled=p_enabled,daily_limit=p_limit,updated_at=now();
end;$$;
create function public.reserve_assistant_request(p_company uuid,p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare maxrequests integer;
begin
 if not app_private.can_access(p_company,'ia','write') then raise exception 'permission_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':assistant',0));
 select daily_limit into maxrequests from public.assistant_settings where company_id=p_company and enabled;if not found then raise exception 'assistant_disabled';end if;
 if p_id is null then raise exception 'invalid_request';end if;
 if exists(select 1 from public.assistant_usage where id=p_id) then return false;end if;
 if (select count(*) from public.assistant_usage where company_id=p_company and created_at>now()-interval '24 hours')>=maxrequests
 or (select count(*) from public.assistant_usage where company_id=p_company and user_id=auth.uid() and created_at>now()-interval '1 minute')>=4 then raise exception 'assistant_rate_limit';end if;
 insert into public.assistant_usage(id,company_id,user_id) values(p_id,p_company,auth.uid());return true;
end;$$;
create function public.assistant_context(p_company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}';v jsonb;
begin
 if not app_private.can_access(p_company,'ia','read') then raise exception 'permission_denied' using errcode='42501';end if;
 if app_private.can_access(p_company,'clientes','read') then select jsonb_build_object('active',count(*) filter(where status='active'),'archived',count(*) filter(where status='archived')) into v from public.customers where company_id=p_company;result:=result||jsonb_build_object('clientes',v);end if;
 if app_private.can_access(p_company,'fin-estimados','read') then select jsonb_build_object('count',count(*),'drafts',count(*) filter(where status='BORRADOR'),'pending',count(*) filter(where status='PENDIENTE'),'approved',count(*) filter(where status='APROBADO')) into v from public.estimates where company_id=p_company;result:=result||jsonb_build_object('estimados',v);end if;
 if app_private.can_access(p_company,'fin-invoices','read') then select jsonb_build_object('open_count',count(*) filter(where status='OPEN'),'balance_usd',coalesce(sum(balance_due) filter(where status='OPEN'),0),'overdue_count',count(*) filter(where status='OPEN' and balance_due>0 and due_date<(now() at time zone (select timezone from public.companies where id=p_company))::date)) into v from public.invoices where company_id=p_company;result:=result||jsonb_build_object('facturas',v);end if;
 if app_private.can_access(p_company,'fin-proyectos','read') then select coalesce(jsonb_object_agg(status,n),'{}') into v from (select status,count(*) n from public.projects where company_id=p_company group by status) x;result:=result||jsonb_build_object('proyectos',v);end if;
 if app_private.can_access(p_company,'inventario','read') then select jsonb_build_object('items',count(*),'below_minimum',count(*) filter(where stock<coalesce((data->>'minimum')::numeric,0))) into v from public.work_records where company_id=p_company and kind='inventory' and status<>'ARCHIVADO';result:=result||jsonb_build_object('inventario',v);end if;
 if app_private.can_access(p_company,'horasfix','read') then select jsonb_build_object('pending',count(*) filter(where status='PENDIENTE'),'open',count(*) filter(where ends_at is null and status<>'ANULADO')) into v from public.time_entries where company_id=p_company;result:=result||jsonb_build_object('horas',v);end if;
 return result;
end;$$;
revoke all on function public.configure_assistant(uuid,boolean,integer),public.reserve_assistant_request(uuid,uuid),public.assistant_context(uuid) from public,anon;
grant execute on function public.configure_assistant(uuid,boolean,integer),public.reserve_assistant_request(uuid,uuid),public.assistant_context(uuid) to authenticated;
commit;
