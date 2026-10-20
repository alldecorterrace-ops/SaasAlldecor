-- Optional staging rehearsal only. Never apply to production or enable a row
-- without a concrete recipient/invitation approval. Empty policy permits nothing.
begin;
do $$begin
 if to_regclass('staging_private.auth_mail') is null
 or to_regprocedure('public.staging_capture_auth_email(jsonb)') is null
 or to_regclass('staging_private.reactivation_activation_20261013') is null
 or not exists(select 1 from staging_private.reactivation_activation_20261013
 where key='release' and value->>'project_ref'='ejeuxzukutzzlbzjnyio')
 then raise exception 'isolated_staging_capture_required';end if;
end;$$;
create table staging_private.invitation_delivery_test (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 company_id uuid not null references public.companies(id),
 invitation_id uuid not null unique,
 email text not null check(email=lower(trim(email))),
 created_at timestamptz not null default now(),expires_at timestamptz not null,
 check(expires_at>created_at and expires_at<=created_at+interval '2 hours')
);
alter table staging_private.invitation_delivery_test enable row level security;
revoke all on staging_private.invitation_delivery_test from public,anon,authenticated,service_role,supabase_auth_admin;
create function public.staging_invitation_signup_capture_allowed(p_email text,p_user uuid,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_action='signup' and exists(
 select 1 from staging_private.invitation_delivery_test q
 join public.company_invitations i on i.id=q.invitation_id and i.company_id=q.company_id and i.email=q.email
 join auth.users u on u.id=p_user and lower(u.email)=q.email and u.email_confirmed_at is null
 where q.enabled and q.email=lower(p_email) and q.expires_at>now()
 and i.status='pending' and i.expires_at>now() and i.role='member' and i.permissions='{"clientes":["read"]}'::jsonb
 and app_private.billing_writable(q.company_id) and public.registration_invitation_available(q.email));
$$;
revoke all on function public.staging_invitation_signup_capture_allowed(text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.staging_invitation_signup_capture_allowed(text,uuid,text) to supabase_auth_admin;

-- Preserve the synthetic-only constraints on the existing capture table.
-- The approved real signup has separate private custody and an enforced scope.
create table staging_private.invitation_auth_mail (
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),
 user_id uuid not null,recipient text not null,email_data jsonb not null,
 check(jsonb_typeof(email_data)='object' and octet_length(email_data::text)<=16384),
 check(recipient=lower(trim(recipient)) and length(recipient)<=254)
);
alter table staging_private.invitation_auth_mail enable row level security;
revoke all on staging_private.invitation_auth_mail from public,anon,authenticated,service_role,supabase_auth_admin;
grant insert(user_id,recipient,email_data) on staging_private.invitation_auth_mail to supabase_auth_admin;
-- Admission is checked on new writes; expiration must not invalidate old evidence
-- during an operator restore of an encrypted snapshot.
create policy invitation_auth_capture on staging_private.invitation_auth_mail for insert to supabase_auth_admin
 with check(public.staging_invitation_signup_capture_allowed(recipient,user_id,email_data->>'email_action_type'));

CREATE OR REPLACE FUNCTION public.staging_capture_auth_email(event jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $function$
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
  if recipient is null or (recipient !~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$'
      and not public.staging_invitation_signup_capture_allowed(recipient,(event #>> '{user,id}')::uuid,mail_data->>'email_action_type')) then
    raise exception 'synthetic_recipient_required';
  end if;
  -- Email changes remain limited to synthetic addresses, including both ends.
  foreach address in array array[new_recipient, nullif(lower(mail_data ->> 'old_email'), ''),
      nullif(lower(mail_data ->> 'new_email'), '')] loop
    if address is not null and address !~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$' then
      raise exception 'synthetic_recipient_required';
    end if;
  end loop;
  if recipient ~ '^[a-z0-9][a-z0-9._+-]{0,63}@saasalldecor[.]invalid$' then
    insert into staging_private.auth_mail(user_id, recipient, new_recipient, email_data)
      values ((event #>> '{user,id}')::uuid, recipient, new_recipient, mail_data);
  else
    insert into staging_private.invitation_auth_mail(user_id, recipient, email_data)
      values ((event #>> '{user,id}')::uuid, recipient, mail_data);
  end if;
  -- Only capture. No external authentication message is sent by this function.
  return '{}'::jsonb;
end;
$function$;
revoke all on function public.staging_capture_auth_email(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.staging_capture_auth_email(jsonb) to supabase_auth_admin;
commit;
