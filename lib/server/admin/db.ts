/**
 * Fork: Postgres access for NIE admin data (signed-in users, per-user usage).
 *
 * Uses the same DATABASE_URL as server persistence, with its own small pool and
 * its own tables (prefixed `openmaic_`), created on first use. Nothing here
 * touches the upstream storage schema.
 */
import { Pool } from 'pg';

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

export function isAdminDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    pool.on('error', () => {
      // An idle client error must not crash the process; the next query retries.
    });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS openmaic_users (
  owner_id      text PRIMARY KEY,
  user_id       text NOT NULL,
  name          text NOT NULL DEFAULT '',
  email         text NOT NULL DEFAULT '',
  department    text NOT NULL DEFAULT '',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  login_count   integer NOT NULL DEFAULT 1
);

ALTER TABLE openmaic_users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE TABLE IF NOT EXISTS openmaic_usage (
  id                    text PRIMARY KEY,
  created_at            timestamptz NOT NULL,
  owner_id              text,
  kind                  text NOT NULL,
  source                text NOT NULL,
  provider_id           text NOT NULL,
  model_id              text NOT NULL,
  model_string          text NOT NULL,
  input_tokens          integer NOT NULL DEFAULT 0,
  output_tokens         integer NOT NULL DEFAULT 0,
  cache_read_tokens     integer NOT NULL DEFAULT 0,
  cache_creation_tokens integer NOT NULL DEFAULT 0,
  reasoning_tokens      integer NOT NULL DEFAULT 0,
  quantity              double precision,
  unit                  text
);
CREATE INDEX IF NOT EXISTS openmaic_usage_owner_idx ON openmaic_usage (owner_id, created_at);
CREATE INDEX IF NOT EXISTS openmaic_usage_created_idx ON openmaic_usage (created_at);
`;

/** Run a query after making sure the admin tables exist. */
export async function adminQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const db = getPool();
  schemaReady ??= db
    .query(SCHEMA)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  await schemaReady;
  const result = await db.query(text, values);
  return result.rows as T[];
}
