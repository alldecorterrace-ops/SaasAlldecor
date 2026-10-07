// Minimal test doubles for Supabase-owned schemas, not Auth/Storage services.
export const authStorageContract = `
create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as
 $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.role() to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
`;
