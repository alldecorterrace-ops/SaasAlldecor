begin;
create table public.invitation_email_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  invitation_id uuid not null references public.company_invitations(id),
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'processing' check(status in ('processing','queued','failed','unknown')),
  check ((status='processing')=(finished_at is null))
);
create index invitation_email_company_time on public.invitation_email_attempts(company_id,created_at desc);
create index invitation_email_invitation_time on public.invitation_email_attempts(invitation_id,created_at desc);
alter table public.invitation_email_attempts enable row level security;
revoke all on public.invitation_email_attempts from public,anon,authenticated;
grant select on public.invitation_email_attempts to authenticated;
create policy invitation_email_read on public.invitation_email_attempts for select to authenticated using(app_private.is_manager(company_id));

create function public.claim_invitation_email(p_company uuid,p_invitation uuid,p_retry boolean default false)
returns table(attempt_id uuid,email text,company_name text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare invitation public.company_invitations; attempt uuid;
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  -- Serializes company quota and concurrent sends/retries.
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':invitation-mail',0));
  select * into invitation from public.company_invitations where id=p_invitation and company_id=p_company for update;
  if not found or invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'invitation_unavailable'; end if;
  if not exists(select 1 from public.memberships where company_id=p_company and user_id=invitation.invited_by and active and role in ('owner','admin'))
    then raise exception 'invitation_unavailable'; end if;
  if not coalesce(p_retry,false) and exists(select 1 from public.invitation_email_attempts where invitation_id=p_invitation) then return; end if;
  if exists(select 1 from public.invitation_email_attempts where invitation_id=p_invitation and created_at>now()-interval '5 minutes')
    or (select count(*) from public.invitation_email_attempts where invitation_id=p_invitation and created_at>now()-interval '24 hours')>=3
    or (select count(*) from public.invitation_email_attempts where company_id=p_company and created_at>now()-interval '24 hours')>=50
    then raise exception 'mail_rate_limited'; end if;
  insert into public.invitation_email_attempts(company_id,invitation_id,requested_by) values(p_company,p_invitation,auth.uid()) returning id into attempt;
  return query select attempt,invitation.email,c.name,invitation.expires_at from public.companies c where c.id=p_company;
end; $$;

create function public.finish_invitation_email(p_company uuid,p_attempt uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not app_private.is_manager(p_company) then raise exception 'permission_denied' using errcode='42501'; end if;
  if p_status is null or p_status not in ('queued','failed','unknown') then raise exception 'invalid_mail_status'; end if;
  update public.invitation_email_attempts set status=p_status,finished_at=now()
    where id=p_attempt and company_id=p_company and requested_by=auth.uid() and status='processing';
  -- A retry of finalization is harmless; it cannot overwrite an earlier outcome.
end; $$;
revoke all on function public.claim_invitation_email(uuid,uuid,boolean),public.finish_invitation_email(uuid,uuid,text) from public,anon;
grant execute on function public.claim_invitation_email(uuid,uuid,boolean),public.finish_invitation_email(uuid,uuid,text) to authenticated;
comment on table public.invitation_email_attempts is 'App-reported local mail handoff attempts, not recipient-delivery receipts. No automatic retry of uncertain handoffs.';
commit;
