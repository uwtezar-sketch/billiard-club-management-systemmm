import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "@/lib/databaseUrl";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: normalizeDatabaseUrl(databaseUrl),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

if (!globalForDb.__arenaNextJsPostgresqlPool) {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
  // An idle connection may be closed by Neon; avoid an unhandled EventEmitter error.
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("database_pool_idle_error", { code: error.code || "UNKNOWN" });
  });
}

export const db = drizzle(pool);
