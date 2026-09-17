begin;
create table public.web_forms(id uuid primary key,company_id uuid not null references public.companies(id),expires_at timestamptz not null,active boolean not null default true,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.web_requests(id uuid primary key,company_id uuid not null references public.companies(id),form_id uuid not null references public.web_forms(id),data jsonb not null,status text not null default 'NUEVO' check(status in ('NUEVO','CONVERTIDO','ARCHIVADO')),lead_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(company_id,lead_id) references public.leads(company_id,id));
create index web_requests_company_date on public.web_requests(company_id,created_at desc,id);
alter table public.web_forms enable row level security;alter table public.web_requests enable row level security;
revoke all on public.web_forms,public.web_requests from anon,authenticated;grant select on public.web_forms,public.web_requests to authenticated;
create policy web_forms_read on public.web_forms for select to authenticated using(app_private.can_access(company_id,'estimadosweb','read'));
create policy web_requests_read on public.web_requests for select to authenticated using(app_private.can_access(company_id,'estimadosweb','read'));
create trigger web_forms_audit after insert or update on public.web_forms for each row execute function app_private.audit_change();
create trigger web_requests_audit after insert or update on public.web_requests for each row execute function app_private.audit_change();
create function public.manage_web_form(p_company uuid,p_id uuid,p_create boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_create then insert into public.web_forms(id,company_id,expires_at,created_by) values(p_id,p_company,now()+interval '30 days',auth.uid());
 else update public.web_forms set active=false where id=p_id and company_id=p_company;end if;
end;$$;
create function public.web_form_info(p_form uuid) returns text language sql stable security definer set search_path='' as $$
 select c.name from public.web_forms f join public.companies c on c.id=f.company_id join public.memberships m on m.company_id=f.company_id and m.user_id=f.created_by where f.id=p_form and f.active and f.expires_at>now() and m.active and (m.role in ('owner','admin') or coalesce(m.permissions->'estimadosweb' ? 'write',false));
$$;
create function public.submit_web_request(p_form uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;k text;clean jsonb:='{}';oldrow public.web_requests;
begin
 if public.web_form_info(p_form) is null then raise exception 'form_unavailable';end if;
 if p_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'invalid_request';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 2 and 160 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_data->>'email')>254 or length(coalesce(p_data->>'phone',''))>64 or length(coalesce(p_data->>'message',''))>2000 or coalesce(p_data->>'service','') not in ('Pérgola','Cocina exterior','Pared','Otro') then raise exception 'invalid_contact';end if;
 foreach k in array array['length','width','height'] loop
  if coalesce(p_data->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' or (p_data->>k)::numeric>200 then raise exception 'invalid_dimension';end if;
 end loop;
 foreach k in array array['name','email','phone','message','service','length','width','height'] loop clean:=clean||jsonb_build_object(k,trim(coalesce(p_data->>k,'')));end loop;
 select company_id into cid from public.web_forms where id=p_form;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':web-requests',0));
 select * into oldrow from public.web_requests where id=p_id;
 if found then if oldrow.form_id=p_form and oldrow.data=clean then return p_id;end if;raise exception 'request_conflict';end if;
 if (select count(*) from public.web_requests where company_id=cid and created_at>now()-interval '24 hours')>=50 then raise exception 'form_daily_limit';end if;
 insert into public.web_requests(id,company_id,form_id,data) values(p_id,cid,p_form,clean);return p_id;
end;$$;
create function public.review_web_request(p_company uuid,p_id uuid,p_convert boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.web_requests;lid uuid;
begin
 if not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into r from public.web_requests where company_id=p_company and id=p_id for update;if not found then raise exception 'request_unavailable';end if;
 if r.lead_id is not null then return r.lead_id;end if;
 if p_convert then
  lid:=gen_random_uuid();perform public.save_lead(p_company,lid,0,jsonb_build_object('full_name',r.data->>'name','email',r.data->>'email','phone',r.data->>'phone','address','','city','','postal_code','','service',r.data->>'service','message',(r.data->>'message')||E'\nMedidas aproximadas (ft): '||(r.data->>'length')||' × '||(r.data->>'width')||' × '||(r.data->>'height'),'contact_preference','','appointment_date',null,'lead_date',(r.created_at at time zone (select timezone from public.companies where id=p_company))::date,'source','Formulario web','status','NUEVO','archived',false));
  update public.web_requests set lead_id=lid,status='CONVERTIDO',updated_at=now() where id=p_id;
 else update public.web_requests set status='ARCHIVADO',updated_at=now() where id=p_id;end if;
 return lid;
end;$$;
revoke all on function public.manage_web_form(uuid,uuid,boolean),public.web_form_info(uuid),public.submit_web_request(uuid,uuid,jsonb),public.review_web_request(uuid,uuid,boolean) from public;
grant execute on function public.manage_web_form(uuid,uuid,boolean),public.review_web_request(uuid,uuid,boolean) to authenticated;
grant execute on function public.web_form_info(uuid),public.submit_web_request(uuid,uuid,jsonb) to anon,authenticated;
commit;
