import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth/jwt';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isAdminOwner } from '@/lib/server/admin/admins';
import { nieOwnerId } from '@/lib/server/agent-runtime/owner-header';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return apiError('UNAUTHORIZED', 401, 'Not authenticated');
  const user = await verifyJWT(token);
  if (!user) return apiError('UNAUTHORIZED', 401, 'Session expired');
  // Fork: the browser shows the Admin entry from this; every admin route
  // re-checks it server-side.
  const ownerId = nieOwnerId(user);
  return apiSuccess({
    ...user,
    isAdmin: isAdminOwner(ownerId),
    // Fork: the runtime-storage partition the server will accept for this
    // user. Not a secret; the server re-derives it from the session.
    learnerKey: ownerId,
  });
}
