// Test fixtures only. Never part of a production migration or app authorization.
// Strict onboarding tests deliberately do not install this fixture.
export const syntheticManagerFixtures = `
  create function app_private.fixture_company_creator() returns trigger language plpgsql as $$begin
  if NEW.email_confirmed_at is not null then insert into public.platform_accounts(user_id,role) values(NEW.id,'manager') on conflict do nothing; end if; return NEW; end;$$;
  create trigger fixture_creator after insert on auth.users for each row execute function app_private.fixture_company_creator();
`;
