-- Immutable PDF revisions; no changes to financial records, sharing or historical imports.
begin;
create table public.commercial_documents(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 kind text not null check(kind in ('estimate','invoice')),record_id uuid not null,customer_id uuid not null,
 record_version integer not null check(record_version>0),number text not null,snapshot jsonb not null,
 state text not null default 'pending' check(state in ('pending','ready')),sha256 text,bytes integer,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 ready_at timestamptz,unique(company_id,id),unique(company_id,kind,record_id,record_version),
 foreign key(company_id,customer_id) references public.customers(company_id,id),
 check((state='pending' and sha256 is null and bytes is null and ready_at is null) or
 (state='ready' and sha256~'^[0-9a-f]{64}$' and bytes between 1 and 5000000 and ready_at is not null))
);
create function app_private.commercial_module(k text) returns text language sql immutable set search_path='' as $$
 select case k when 'estimate' then 'fin-estimados' when 'invoice' then 'fin-invoices' end;
$$;
revoke all on function app_private.commercial_module(text) from public,anon;
grant execute on function app_private.commercial_module(text) to authenticated;
alter table public.commercial_documents enable row level security;
revoke all on public.commercial_documents from public,anon,authenticated;
grant select on public.commercial_documents to authenticated;
create policy commercial_documents_read on public.commercial_documents for select to authenticated using(app_private.can_access(company_id,app_private.commercial_module(kind),'read'));
create trigger commercial_documents_audit after insert or update on public.commercial_documents for each row execute function app_private.audit_change();
create index commercial_documents_customer on public.commercial_documents(company_id,customer_id,kind,record_id,record_version desc) where state='ready';

create function public.prepare_commercial_document(p_company uuid,p_kind text,p_record uuid,p_version integer)
returns public.commercial_documents language plpgsql security definer set search_path='' as $$
declare src jsonb;co jsonb;d public.commercial_documents;
begin
 if p_kind is null or p_kind not in ('estimate','invoice') or not app_private.can_access(p_company,app_private.commercial_module(p_kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_kind='estimate' then select to_jsonb(e) into src from public.estimates e where company_id=p_company and id=p_record for share;
 else select to_jsonb(i) into src from public.invoices i where company_id=p_company and id=p_record for share;end if;
 if src is null then raise exception 'document_unavailable';end if;
 if p_version is null or (src->>'version')::integer<>p_version then raise exception 'record_conflict' using errcode='PT409';end if;
 if (p_kind='estimate' and src->>'status' in ('BORRADOR','ANULADA')) or (p_kind='invoice' and src->>'status'='VOID') then raise exception 'document_state';end if;
 if coalesce(src->>'historical_estimate_id',src->>'historical_invoice_id') is not null then raise exception 'historical_original_required';end if;
 select jsonb_build_object('name',name,'timezone',timezone) into co from public.companies where id=p_company;
 insert into public.commercial_documents(company_id,kind,record_id,customer_id,record_version,number,snapshot,created_by)
 values(p_company,p_kind,p_record,(src->>'customer_id')::uuid,p_version,src->>'number',jsonb_build_object('company',co,'record',src),auth.uid())
 on conflict(company_id,kind,record_id,record_version) do nothing;
 select * into d from public.commercial_documents where company_id=p_company and kind=p_kind and record_id=p_record and record_version=p_version;
 return d;
end;$$;
revoke all on function public.prepare_commercial_document(uuid,text,uuid,integer) from public,anon;
grant execute on function public.prepare_commercial_document(uuid,text,uuid,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('commercial-pdfs','commercial-pdfs',false,5000000,array['application/pdf']);
create function app_private.commercial_file_access(p_name text,p_action text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare d public.commercial_documents;
begin
 if p_name is null or p_name!~'^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' or p_action not in ('read','write') then return false;end if;
 select * into d from public.commercial_documents where company_id=split_part(p_name,'/',1)::uuid and id=split_part(split_part(p_name,'/',2),'.',1)::uuid;
 return found and app_private.can_access(d.company_id,app_private.commercial_module(d.kind),p_action) and (p_action='read' or d.state='pending');
exception when invalid_text_representation then return false;
end;$$;
revoke all on function app_private.commercial_file_access(text,text) from public,anon;
grant execute on function app_private.commercial_file_access(text,text) to authenticated;
create policy commercial_pdf_read on storage.objects for select to authenticated using(bucket_id='commercial-pdfs' and app_private.commercial_file_access(name,'read'));
create policy commercial_pdf_insert on storage.objects for insert to authenticated with check(bucket_id='commercial-pdfs' and app_private.commercial_file_access(name,'write'));

create function public.finish_commercial_document(p_company uuid,p_document uuid,p_sha256 text,p_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.commercial_documents;
begin
 select * into d from public.commercial_documents where company_id=p_company and id=p_document for update;
 if not found or not app_private.can_access(p_company,app_private.commercial_module(d.kind),'write') then raise exception 'permission_denied' using errcode='42501';end if;
 if p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 1 and 5000000 then raise exception 'invalid_document';end if;
 if d.state='ready' then
  if d.sha256<>p_sha256 or d.bytes<>p_bytes then raise exception 'immutable_document';end if;
  return d.id;
 end if;
 if not exists(select 1 from storage.objects where bucket_id='commercial-pdfs' and name=p_company::text||'/'||d.id::text||'.pdf') then raise exception 'missing_document_file';end if;
 update public.commercial_documents set state='ready',sha256=p_sha256,bytes=p_bytes,ready_at=now() where id=d.id;
 return d.id;
end;$$;
revoke all on function public.finish_commercial_document(uuid,uuid,text,integer) from public,anon;
grant execute on function public.finish_commercial_document(uuid,uuid,text,integer) to authenticated;

create function public.customer_commercial_documents(p_company uuid,p_customer uuid,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page not between 1 and 100000 then raise exception 'invalid_page';end if;
 if not app_private.can_access(p_company,'clientes','read') or not exists(select 1 from public.customers where company_id=p_company and id=p_customer)
 or not (app_private.can_access(p_company,'fin-estimados','read') or app_private.can_access(p_company,'fin-invoices','read')) then raise exception 'permission_denied' using errcode='42501';end if;
 with eligible as materialized (
 select d.* from public.commercial_documents d where d.company_id=p_company and d.customer_id=p_customer and d.state='ready' and (
 (d.kind='estimate' and exists(select 1 from public.estimates e where e.company_id=p_company and e.id=d.record_id and e.customer_id=p_customer and e.status<>'BORRADOR')) or
 (d.kind='invoice' and exists(select 1 from public.invoices i where i.company_id=p_company and i.id=d.record_id and i.customer_id=p_customer and i.status<>'VOID'))
 )
 ), latest as materialized (select distinct on(kind,record_id) id,kind,record_id,record_version,number,ready_at from eligible order by kind,record_id,record_version desc),
 summary as (select count(*)::integer count from latest),pages as(select count,least(p_page,greatest(1,(count+19)/20)) page from summary),
 rows as(select * from latest order by ready_at desc,id limit 20 offset (select (page-1)*20 from pages))
 select jsonb_build_object('count',p.count,'page',p.page,'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.ready_at desc,r.id) from rows r),'[]'::jsonb)) into result from pages p;
 return result;
end;$$;
revoke all on function public.customer_commercial_documents(uuid,uuid,integer) from public,anon;
grant execute on function public.customer_commercial_documents(uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
