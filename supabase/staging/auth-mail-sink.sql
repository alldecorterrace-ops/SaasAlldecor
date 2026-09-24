-- Staging only. NOT a production migration. Verify the connection first.
-- Run SET saas.install_staging_mail_sink = 'verified-empty-staging'; separately.
-- Configure this Send Email hook BEFORE enabling the Email provider.
begin;

do $$
begin
  if current_setting('saas.install_staging_mail_sink', true) is distinct from
      'verified-empty-staging' then
    raise exception 'staging_connection_must_be_verified';
  end if;
  if exists (select 1 from auth.users) or exists (select 1 from public.companies)
      or exists (select 1 from storage.objects) then
    raise exception 'mail_sink_requires_empty_staging';
  end if;
end;
$$;

-- CREATE deliberately rejects reinstallation instead of replacing captured data.
create schema staging_private;
revoke all on schema staging_private from public, anon, authenticated;
grant usage on schema staging_private to supabase_auth_admin;

create table staging_private.auth_mail (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  recipient text not null check (recipient ~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$'),
  new_recipient text check (new_recipient ~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$'),
  email_data jsonb not null check (jsonb_typeof(email_data) = 'object' and octet_length(email_data::text) <= 16384)
);
alter table staging_private.auth_mail enable row level security;
revoke all on staging_private.auth_mail from public, anon, authenticated, supabase_auth_admin;
grant insert (user_id, recipient, new_recipient, email_data)
  on staging_private.auth_mail to supabase_auth_admin;
create policy auth_mail_capture on staging_private.auth_mail
  for insert to supabase_auth_admin with check (true);

create function public.staging_capture_auth_email(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  recipient text := lower(event #>> '{user,email}');
  new_recipient text := nullif(lower(event #>> '{user,new_email}'), '');
  mail_data jsonb := event -> 'email_data';
  address text;
begin
  if jsonb_typeof(event) is distinct from 'object'
      or jsonb_typeof(event -> 'user') is distinct from 'object'
      or jsonb_typeof(mail_data) is distinct from 'object'
      or octet_length(event::text) > 32768
      or nullif(event #>> '{user,id}', '') is null
      or nullif(mail_data ->> 'email_action_type', '') is null then
    raise exception 'invalid_staging_mail_event';
  end if;
  if recipient is null or recipient !~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$' then
    raise exception 'synthetic_recipient_required';
  end if;
  -- Email changes can include both addresses. Never capture a real recipient.
  foreach address in array array[new_recipient, nullif(lower(mail_data ->> 'old_email'), ''),
      nullif(lower(mail_data ->> 'new_email'), '')] loop
    if address is not null and address !~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$' then
      raise exception 'synthetic_recipient_required';
    end if;
  end loop;
  insert into staging_private.auth_mail(user_id, recipient, new_recipient, email_data)
    values ((event #>> '{user,id}')::uuid, recipient, new_recipient, mail_data);
  -- Supabase treats this as successful delivery. No SMTP or HTTP call is made.
  return '{}'::jsonb;
end;
$$;
revoke all on function public.staging_capture_auth_email(jsonb) from public, anon, authenticated;
grant execute on function public.staging_capture_auth_email(jsonb) to supabase_auth_admin;
comment on table staging_private.auth_mail is
  'Synthetic staging emails only. Contains active Auth tokens. Owner-only read; never expose through API, logs or GitHub.';
commit;
