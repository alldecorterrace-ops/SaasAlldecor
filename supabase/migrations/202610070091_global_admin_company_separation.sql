-- Global administration manages invited managers; company operation belongs to those managers and their teams.
-- Restrict access without deleting or rewriting any company, membership or account.
begin;
create or replace function app_private.platform_access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.platform_accounts
  where user_id=auth.uid() and (not active or role='administrator'));
$$;
-- Keep the legacy invitation listing consistent with the role-aware recipient rules.
create or replace function public.my_company_invitations()
returns table(id uuid,company_name text,created_at timestamptz,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
 select i.id,i.company_name,c.created_at,i.expires_at from public.my_company_role_invitations() i
 join public.company_invitations c on c.id=i.id order by c.created_at desc limit 100;
$$;
-- Use the common company authorization check for notification preferences as well.
alter policy web_notice_settings_read on public.web_notice_settings
 using(app_private.is_manager(company_id));
commit;
