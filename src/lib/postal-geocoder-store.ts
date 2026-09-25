import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PostalLookup, PostalLookupStore } from "./postal-geocoder";

// Public ZIP coordinates only: no addresses, names, companies or credentials.
// SQLite transactions coordinate processes/restarts on ONE configured host.
export class SqlitePostalLookupStore implements PostalLookupStore {
  private db: DatabaseSync;
  constructor(
    directory: string,
    private now: () => number = Date.now,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const path = join(directory, "postal-geocoder.sqlite");
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS gate(id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, until_ms INTEGER NOT NULL, next_ms INTEGER NOT NULL);
      INSERT OR IGNORE INTO gate VALUES(1,NULL,0,0);
      CREATE TABLE IF NOT EXISTS cache(zip TEXT PRIMARY KEY, result TEXT NOT NULL, expires_ms INTEGER NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  reserve(zip: string): { token: string } | { result: PostalLookup } {
    return this.transaction(() => this.reserveLocked(zip));
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private reserveLocked(
    zip: string,
  ): { token: string } | { result: PostalLookup } {
    const now = this.now();
    const cached = this.db
      .prepare("SELECT result FROM cache WHERE zip=? AND expires_ms>?")
      .get(zip, now);
    if (cached)
      return { result: JSON.parse(String(cached.result)) as PostalLookup };
    const gate = this.db
      .prepare("SELECT until_ms,next_ms FROM gate WHERE id=1")
      .get()!;
    const wait = Math.max(Number(gate.until_ms), Number(gate.next_ms)) - now;
    if (wait > 0) return { result: { status: "busy", retryAfterMs: wait } };
    const token = randomUUID();
    // Timeout is 10s; 45s lease allows a crashed worker to recover conservatively.
    // 15.25s spacing also respects the stricter limit for recurring/bulk use.
    this.db
      .prepare("UPDATE gate SET token=?,until_ms=?,next_ms=? WHERE id=1")
      .run(token, now + 45_000, now + 15_250);
    return { token };
  }
  finish(zip: string, token: string, result: PostalLookup) {
    return this.transaction(() => {
      const now = this.now();
      const gate = this.db
        .prepare("SELECT token,until_ms FROM gate WHERE id=1")
        .get()!;
      // A delayed/abandoned response must not release someone else's reservation.
      if (gate.token !== token || Number(gate.until_ms) <= now) return false;
      if (result.status === "found" || result.status === "missing") {
        this.db
          .prepare(
            "INSERT INTO cache VALUES(?,?,?) ON CONFLICT(zip) DO UPDATE SET result=excluded.result,expires_ms=excluded.expires_ms",
          )
          .run(
            zip,
            JSON.stringify(result),
            now + (result.status === "found" ? 7 : 1) * 86_400_000,
          );
      }
      this.db
        .prepare(
          "UPDATE gate SET token=NULL,until_ms=0,next_ms=max(next_ms,?) WHERE id=1",
        )
        .run(result.status === "unavailable" ? now + 60_000 : 0);
      return true;
    });
  }
}
