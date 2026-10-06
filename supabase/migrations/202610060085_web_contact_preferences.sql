-- Preserve optional web contact fields through review and conversion. No backfill.
begin;
create or replace function public.submit_web_request(p_form uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;k text;clean jsonb:='{}';oldrow public.web_requests;
begin
 if public.web_form_info(p_form) is null then raise exception 'form_unavailable';end if;
 if p_id is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'invalid_request';end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 2 and 160 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_data->>'email')>254 or length(coalesce(p_data->>'phone',''))>64 or length(coalesce(p_data->>'message',''))>2000 or coalesce(p_data->>'service','') not in ('Pérgola','Cocina exterior','Pared','Otro') then raise exception 'invalid_contact';end if;
 foreach k in array array['length','width','height'] loop
  if coalesce(p_data->>k,'') !~ '^[0-9]{1,3}(\.[0-9]{1,3})?$' or (p_data->>k)::numeric>200 then raise exception 'invalid_dimension';end if;
 end loop;
 foreach k in array array['name','email','phone','message','service','length','width','height'] loop clean:=clean||jsonb_build_object(k,trim(coalesce(p_data->>k,'')));end loop;
 -- Optional fields are absent when blank, preserving old idempotent requests.
 foreach k in array array['address','city','postal_code'] loop
  if p_data ? k and jsonb_typeof(p_data->k) not in ('string','null') then raise exception 'invalid_location';end if;
  if length(coalesce(p_data->>k,'')) > (case k when 'address' then 255 when 'city' then 128 else 24 end) then raise exception 'invalid_location';end if;
  if btrim(coalesce(p_data->>k,''))<>'' then clean:=clean||jsonb_build_object(k,btrim(p_data->>k));end if;
 end loop;
 -- Keep blank optional values absent for legacy idempotent requests.
 foreach k in array array['contact_preference','appointment_date'] loop
  if p_data ? k and jsonb_typeof(p_data->k) not in ('string','null') then raise exception 'invalid_contact_preferences';end if;
 end loop;
 if length(coalesce(p_data->>'contact_preference',''))>60 then raise exception 'invalid_contact_preferences';end if;
 if btrim(coalesce(p_data->>'contact_preference',''))<>'' then clean:=clean||jsonb_build_object('contact_preference',btrim(p_data->>'contact_preference'));end if;
 if btrim(coalesce(p_data->>'appointment_date',''))<>'' then
  if (p_data->>'appointment_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_contact_preferences';end if;
  begin
   if (p_data->>'appointment_date')::date is null then raise exception 'invalid_contact_preferences';end if;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'invalid_contact_preferences';end;
  clean:=clean||jsonb_build_object('appointment_date',p_data->>'appointment_date');
 end if;
 select company_id into cid from public.web_forms where id=p_form;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':web-requests',0));
 -- Serialize revocation with admission, then recheck after the tenant lock.
 perform 1 from public.web_forms where id=p_form and company_id=cid and active and expires_at>clock_timestamp() for share;
 if not found then raise exception 'form_unavailable';end if;
 select * into oldrow from public.web_requests where id=p_id;
 if found then if oldrow.form_id=p_form and oldrow.data=clean then return p_id;end if;raise exception 'request_conflict';end if;
 if (select count(*) from public.web_requests where company_id=cid and created_at>now()-interval '24 hours')>=50 then raise exception 'form_daily_limit';end if;
 insert into public.web_requests(id,company_id,form_id,data) values(p_id,cid,p_form,clean);return p_id;
end;$$;
create or replace function public.review_web_request(p_company uuid,p_id uuid,p_convert boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.web_requests;lid uuid;
begin
 if not app_private.can_access(p_company,'estimadosweb','write') then raise exception 'permission_denied' using errcode='42501';end if;
 select * into r from public.web_requests where company_id=p_company and id=p_id for update;if not found then raise exception 'request_unavailable';end if;
 if r.lead_id is not null then return r.lead_id;end if;
 if p_convert then
  lid:=gen_random_uuid();perform public.save_lead(p_company,lid,0,jsonb_build_object('full_name',r.data->>'name','email',r.data->>'email','phone',r.data->>'phone','address',coalesce(r.data->>'address',''),'city',coalesce(r.data->>'city',''),'postal_code',coalesce(r.data->>'postal_code',''),'service',r.data->>'service','message',(r.data->>'message')||E'\nMedidas aproximadas (ft): '||(r.data->>'length')||' × '||(r.data->>'width')||' × '||(r.data->>'height'),'contact_preference',coalesce(r.data->>'contact_preference',''),'appointment_date',nullif(r.data->>'appointment_date',''),'lead_date',(r.created_at at time zone (select timezone from public.companies where id=p_company))::date,'source','Formulario web','status','NUEVO','archived',false));
  update public.web_requests set lead_id=lid,status='CONVERTIDO',updated_at=now() where id=p_id;
 else update public.web_requests set status='ARCHIVADO',updated_at=now() where id=p_id;end if;
 return lid;
end;$$;
notify pgrst,'reload schema';
commit;
