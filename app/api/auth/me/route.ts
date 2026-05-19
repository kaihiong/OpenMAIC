import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth/jwt';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return apiError('UNAUTHORIZED', 401, 'Not authenticated');
  const user = await verifyJWT(token);
  if (!user) return apiError('UNAUTHORIZED', 401, 'Session expired');
  return apiSuccess(user as unknown as Record<string, unknown>);
}
