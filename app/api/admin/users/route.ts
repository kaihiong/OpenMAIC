/**
 * Fork: GET /api/admin/users — everyone who has signed in, with how many
 * courses they own and their AI usage. Administrators only.
 */
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { adminOwnerFromHeaders } from '@/lib/server/admin/admins';
import { adminQuery, isAdminDatabaseConfigured } from '@/lib/server/admin/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!adminOwnerFromHeaders(req.headers)) return apiError('INVALID_REQUEST', 404, 'Not found');
  if (!isAdminDatabaseConfigured()) {
    return apiError('INTERNAL_ERROR', 503, 'DATABASE_URL is not configured');
  }
  const users = await adminQuery(
    `SELECT u.owner_id AS "ownerId", u.user_id AS "userId", u.name, u.email, u.department,
            u.first_seen_at AS "firstSeenAt", u.last_seen_at AS "lastSeenAt",
            u.login_count AS "loginCount",
            greatest(u.last_active_at, u.last_seen_at) AS "lastActiveAt",
            (SELECT count(*)::int FROM stage_meta m
               WHERE m.owner_id = u.owner_id AND m.deleted_at IS NULL) AS "courseCount",
            (SELECT count(*)::int FROM openmaic_usage g WHERE g.owner_id = u.owner_id) AS "requests",
            (SELECT coalesce(sum(g.input_tokens + g.output_tokens), 0)::bigint
               FROM openmaic_usage g WHERE g.owner_id = u.owner_id) AS "llmTokens"
       FROM openmaic_users u
      ORDER BY u.last_seen_at DESC`,
  );
  return apiSuccess({ users: users.map((u) => ({ ...u, llmTokens: Number(u.llmTokens) })) });
}
