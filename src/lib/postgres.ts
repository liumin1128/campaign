import "server-only";

import { Pool, type QueryResultRow } from "pg";
import { getPostgresConnectionString } from "@/lib/env";

declare global {
  var postgresPool: Pool | undefined;
}

function createPool() {
  return new Pool({
    connectionString: getPostgresConnectionString(),
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

const pool = globalThis.postgresPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.postgresPool = pool;
}

export async function queryPostgres<T extends QueryResultRow>(
  text: string,
  values?: unknown[],
) {
  return pool.query<T>(text, values);
}

export async function checkPostgresConnection() {
  const result = await queryPostgres<{ ok: number; server_time: string }>(
    "select 1 as ok, now()::text as server_time",
  );

  return result.rows[0];
}