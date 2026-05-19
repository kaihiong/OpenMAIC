import { cookies } from 'next/headers';
import { signJWT, COOKIE_NAME } from '@/lib/auth/jwt';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function POST(req: Request) {
  const nieAuthUrl = process.env.NIE_AUTH_API_URL;
  const nieAuthKey = process.env.NIE_AUTH_API_KEY;

  if (!nieAuthUrl || !nieAuthKey) {
    return apiError('INTERNAL_ERROR', 500, 'Auth service not configured');
  }

  let body: { userid?: string; pd?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid request body');
  }

  if (!body.userid || !body.pd) {
    return apiError('INVALID_REQUEST', 400, 'Username and password required');
  }

  try {
    const resp = await fetch(`${nieAuthUrl}/LogInUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nie-aws-api-gw-key': nieAuthKey,
      },
      body: JSON.stringify({ userid: body.userid, pd: body.pd }),
    });

    const data = await resp.json();

    if (!data.isAuthenticated) {
      return apiError('UNAUTHORIZED', 401, 'Invalid username or password');
    }

    const token = await signJWT({
      userId: data.userId ?? '',
      name: data.fullName ?? '',
      email: data.email ?? '',
      department: data.department ?? '',
    });

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });

    return apiSuccess({
      name: data.fullName,
      email: data.email,
      department: data.department,
    });
  } catch {
    return apiError('INTERNAL_ERROR', 503, 'Auth service unavailable');
  }
}
