import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth/jwt';
import { sessionCookieOptions } from '@/lib/auth/session-cookie';
import { apiSuccess } from '@/lib/server/api-response';

export async function POST() {
  const cookieStore = await cookies();
  // Expire it with the same attributes it was set with; a Partitioned cookie
  // is not cleared by a delete that omits them.
  cookieStore.set(COOKIE_NAME, '', { ...sessionCookieOptions(), maxAge: 0 });
  return apiSuccess({});
}
