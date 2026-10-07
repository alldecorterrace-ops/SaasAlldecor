import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { authStorageContract } from "./auth-storage-contract";

// Supabase owns auth/storage in production. Only their minimal contracts are
// simulated here; this does not test JWT issuance, email or binary uploads.
export async function fullDatabase(
  throughMigration?: string,
  options: { managedOnboarding?: boolean } = {},
) {
  const db = new PGlite();
  try {
    await db.exec(authStorageContract);
    const directory = new URL("../../supabase/migrations/", import.meta.url);
    const files = (await readdir(directory))
      .filter(
        (f) =>
          f.endsWith(".sql") && (!throughMigration || f <= throughMigration),
      )
      .sort();
    for (const file of files)
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    if (
      !options.managedOnboarding &&
      files.some((f) => f.includes("089_platform_management"))
    )
      await db.exec(`
      create function app_private.fixture_company_creator() returns trigger language plpgsql as $$begin
      if NEW.email_confirmed_at is not null then insert into public.platform_accounts(user_id,role) values(NEW.id,'manager') on conflict do nothing; end if; return NEW; end;$$;
      create trigger fixture_creator after insert on auth.users for each row execute function app_private.fixture_company_creator();
    `);
    return { db, files };
  } catch (error) {
    await db.close();
    throw error;
  }
}
