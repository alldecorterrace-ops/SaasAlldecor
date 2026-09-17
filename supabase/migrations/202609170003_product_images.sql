-- Private, append-only product images. Replacements keep previous objects.
begin;
alter table public.products add column image_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,1500000,array['image/png','image/jpeg','image/webp']);

create function app_private.product_image_access(p_name text,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[];
begin
 if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' then return false; end if;
 parts:=string_to_array(p_name,'/');
 return exists(select 1 from public.products p where p.company_id=parts[1]::uuid and p.id=parts[2]::uuid
   and app_private.can_access(p.company_id,'productos',p_action));
exception when invalid_text_representation then return false;
end; $$;
revoke all on function app_private.product_image_access(text,text) from public;
grant execute on function app_private.product_image_access(text,text) to authenticated;
create policy product_image_read on storage.objects for select to authenticated
using(bucket_id='product-images' and app_private.product_image_access(name,'read'));
create policy product_image_insert on storage.objects for insert to authenticated
with check(bucket_id='product-images' and app_private.product_image_access(name,'write'));

create function public.set_product_image(p_company uuid,p_product uuid,p_version integer,p_path text) returns void
language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if not app_private.can_access(p_company,'productos','write') then raise exception 'permission_denied' using errcode='42501'; end if;
 select version into v from public.products where company_id=p_company and id=p_product for update;
 if not found or p_version is null or v<>p_version then raise exception 'record_conflict' using errcode='40001'; end if;
 if p_path is not null then
   if not app_private.product_image_access(p_path,'write') or split_part(p_path,'/',1)<>p_company::text or split_part(p_path,'/',2)<>p_product::text
     or not exists(select 1 from storage.objects where bucket_id='product-images' and name=p_path) then raise exception 'invalid_image'; end if;
 end if;
 update public.products set image_path=p_path,version=version+1,updated_by=auth.uid(),updated_at=now() where company_id=p_company and id=p_product;
end; $$;
revoke all on function public.set_product_image(uuid,uuid,integer,text) from public,anon;
grant execute on function public.set_product_image(uuid,uuid,integer,text) to authenticated;
commit;
