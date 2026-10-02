-- ADT pricing administration, isolated from retained legacy design price books.
-- Additive schema only. No business import or existing estimate/price rewrite.
begin;
create table public.pricing_settings(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null unique references public.companies(id),
 settings jsonb,
 version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.pricing_settings enable row level security;
revoke all on public.pricing_settings from anon,authenticated;
grant select on public.pricing_settings to authenticated;
create policy pricing_settings_read on public.pricing_settings for select to authenticated
 using(app_private.can_access(company_id,'adm-precios','read'));
create trigger pricing_settings_audit after insert or update on public.pricing_settings
 for each row execute function app_private.audit_change();

create function app_private.pricing_number_valid(v jsonb,nullable boolean default false) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((nullable and v='null'::jsonb) or
  (jsonb_typeof(v)='number' and abs((v#>>'{}')::numeric)<=1000000000000),false)
$$;
create function app_private.pricing_settings_valid(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text;a text;r jsonb;v jsonb;field text;cap integer;allowed text[];
begin
 if s is null then return true;end if;
 if jsonb_typeof(s)<>'object' or octet_length(s::text)>200000 then return false;end if;
 for k in select jsonb_object_keys(s) loop
  if k not in ('markup','markupProducto','overhead','permisoCosto','diaTrabajoExtra','columnasBase',
   'capa2','tarifas','margenArea','markupsOverride','catalogo','componentes') then return false;end if;
  if k in ('markup','markupProducto','overhead','permisoCosto','diaTrabajoExtra','columnasBase')
   and not app_private.pricing_number_valid(s->k) then return false;end if;
 end loop;
 foreach k in array array['capa2','tarifas','margenArea','markupsOverride'] loop
  if not s?k and k='capa2' then continue;end if;
  if jsonb_typeof(s->k) is distinct from 'object' then return false;end if;
  allowed:=case k
   when 'capa2' then array['demanda','demandaUmbral','zonaDefault','zonaFueraMiami','zonaFueraFL']
   when 'tarifas' then array['pergolaBlanco','pergolaCert','pergolaComposite','paredPanel','paredComposite','cocinaPorFt','equiposMargen','permisoFijo','permisoUmbralFt2','permisoPorFt2','heavyPorPieza']
   when 'margenArea' then array['techo','estructura','pared','cocina']
   else array['techo','canal','fascia','composite_mad','estructura','cimentacion','herraje','torn','pared','cocina','equipos'] end;
  for field,v in select key,value from jsonb_each(s->k) loop
   if not field=any(allowed) or not app_private.pricing_number_valid(v) then return false;end if;
  end loop;
 end loop;
 if jsonb_typeof(s->'catalogo') is distinct from 'array' or jsonb_array_length(s->'catalogo')>500
  or jsonb_typeof(s->'componentes') is distinct from 'object' then return false;end if;
 if (select count(*) from jsonb_object_keys(s->'componentes'))<>4 then return false;end if;
 foreach a in array array['techo','estructura','pared','cocina','catalogo'] loop
  v:=case when a='catalogo' then s->a else s->'componentes'->a end;
  if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>(case when a='catalogo' then 500 else 100 end) then return false;end if;
  allowed:=case when a='catalogo' then array['medida','calibre','color','proveedor','largo','precio']
   else array['nombre','tipo','proveedor','regla','cant','unidad','precio','detalle'] end;
  for r in select value from jsonb_array_elements(v) loop
   if jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>array_length(allowed,1) then return false;end if;
   foreach field in array allowed loop
    if field in ('cant','precio','largo') then
     if not app_private.pricing_number_valid(r->field,true) then return false;end if;
    else
     cap:=case field when 'nombre' then 60 when 'medida' then 32 when 'calibre' then 16 when 'color' then 40
      when 'proveedor' then 60 when 'regla' then 40 when 'unidad' then 16 when 'detalle' then 120 else 8 end;
     if jsonb_typeof(r->field) is distinct from 'string' or length(r->>field)>cap then return false;end if;
     if field='tipo' and (r->>field) not in ('material','servicio') then return false;end if;
     if field='nombre' and length(r->>field)=0 then return false;end if;
    end if;
   end loop;
  end loop;
 end loop;
 return true;
exception when others then return false;
end;$$;
revoke all on function app_private.pricing_number_valid(jsonb,boolean),app_private.pricing_settings_valid(jsonb) from public,anon,authenticated;
alter table public.pricing_settings add constraint pricing_settings_payload check(app_private.pricing_settings_valid(settings));

create function public.save_pricing_settings(p_company uuid,p_version integer,p_settings jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oldrow public.pricing_settings;rid uuid;
begin
 if not app_private.can_access(p_company,'adm-precios','write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_version is null or p_version<0 or not app_private.pricing_settings_valid(p_settings) then raise exception 'invalid_pricing_settings';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':pricing-settings',0));
 select * into oldrow from public.pricing_settings where company_id=p_company for update;
 if coalesce(oldrow.version,0)<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if oldrow.id is null then
  insert into public.pricing_settings(company_id,settings,created_by,updated_by)
   values(p_company,p_settings,auth.uid(),auth.uid()) returning id into rid;
 else
  update public.pricing_settings set settings=p_settings,version=version+1,updated_by=auth.uid(),updated_at=now()
   where id=oldrow.id returning id into rid;
 end if;
 return rid;
end;$$;
revoke all on function public.save_pricing_settings(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_pricing_settings(uuid,integer,jsonb) to authenticated;
create or replace function app_private.audit_module(p_entity text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select case p_entity when 'pricing_settings' then 'adm-precios' when 'labor_rates' then 'gastos' when 'labor_project_terms' then 'gastos' when 'labor_settings' then 'gastos' when 'labor_expense_links' then 'gastos' when 'workforce_expenses' then 'horasfix' when 'workforce_profiles' then 'trabajadores' when 'workforce_assignments' then 'trabajadores' when 'web_forms' then 'estimadosweb' when 'web_requests' then 'estimadosweb' when 'designs' then p_data->>'kind' when 'price_books' then 'adm-precios' when 'client_shares' then case p_data->>'kind' when 'estimate' then 'estimadosweb' when 'portal' then 'portal' end when 'assistant_settings' then 'ia' when 'time_entries' then 'horasfix' when 'time_requests' then 'horasfix' when 'time_periods' then 'horasfix' when 'customers' then 'clientes' when 'leads' then 'crm' when 'products' then 'productos' when 'estimates' then 'fin-estimados' when 'invoices' then 'fin-invoices' when 'payments' then 'fin-invoices' when 'projects' then 'fin-proyectos' when 'workers' then 'trabajadores' when 'expenses' then 'gastos' when 'inventory_movements' then 'inventario' when 'work_records' then app_private.work_module(p_data->>'kind') end;
$$;
commit;
