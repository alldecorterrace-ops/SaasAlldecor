import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { authStorageContract } from "./auth-storage-contract";

// Supabase owns auth/storage in production. Only their minimal contracts are
// simulated here; this does not test JWT issuance, email or binary uploads.
export async function fullDatabase() {
  const db = new PGlite();
  try {
    await db.exec(authStorageContract);
    const directory = new URL("../../supabase/migrations/", import.meta.url);
    const files = (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files)
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    return { db, files };
  } catch (error) {
    await db.close();
    throw error;
  }
}
