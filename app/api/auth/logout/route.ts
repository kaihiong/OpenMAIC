import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth/jwt';
import { apiSuccess } from '@/lib/server/api-response';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return apiSuccess({});
}
