/**
 * Fork: GET /api/admin/courses — every course saved on the server, newest
 * first, with its owner. Read-only; administrators only.
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
  const courses = await adminQuery(
    `SELECT s.id, s.name, s.description, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            m.owner_id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail",
            m.is_public AS "isPublic",
            (SELECT count(*)::int FROM document_scenes c WHERE c.stage_id = s.id) AS "sceneCount",
            -- Fork: classic (home-page) generation never sets the meta flag, so
            -- a course also counts as complete once every outlined scene exists.
            (m.generation_complete OR (
               o.planned IS NOT NULL AND o.planned > 0 AND
               (SELECT count(*) FROM document_scenes c WHERE c.stage_id = s.id) >= o.planned
             )) AS "generationComplete",
            o.planned AS "plannedScenes"
       FROM document_stages s
       JOIN stage_meta m ON m.stage_id = s.id
       LEFT JOIN openmaic_users u ON u.owner_id = m.owner_id
       LEFT JOIN LATERAL (
         SELECT CASE jsonb_typeof(d.data)
                  WHEN 'array' THEN jsonb_array_length(d.data)
                  WHEN 'object' THEN jsonb_array_length(coalesce(d.data->'outlines', '[]'::jsonb))
                END AS planned
           FROM document_outlines d WHERE d.stage_id = s.id
       ) o ON true
      WHERE m.deleted_at IS NULL
      ORDER BY s.updated_at DESC
      LIMIT 1000`,
  );
  return apiSuccess({ courses });
}
