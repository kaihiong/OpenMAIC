/**
 * Fork: a record of everyone who has signed in, for the admin Users page.
 * NIE users only exist in the login cookie, so each sign-in upserts a row.
 */
import { createLogger } from '@/lib/logger';
import { nieOwnerId } from '@/lib/server/agent-runtime/owner-header';
import { adminQuery, isAdminDatabaseConfigured } from './db';

const log = createLogger('AdminUsers');

export interface SignedInUser {
  userId: string;
  name: string;
  email: string;
  department: string;
}

/** Upsert the user on sign-in. Never throws: a failure must not block login. */
export async function recordSignIn(user: SignedInUser): Promise<void> {
  const ownerId = nieOwnerId(user);
  if (!ownerId || !isAdminDatabaseConfigured()) return;
  try {
    await adminQuery(
      `INSERT INTO openmaic_users (owner_id, user_id, name, email, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (owner_id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         department = EXCLUDED.department,
         last_seen_at = now(),
         login_count = openmaic_users.login_count + 1`,
      [ownerId, user.userId || user.email, user.name, user.email, user.department],
    );
  } catch (error) {
    log.warn('Failed to record sign-in (ignored):', error);
  }
}
