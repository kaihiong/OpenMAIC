import { apiSuccess } from '@/lib/server/api-response';

export async function GET() {
  return apiSuccess({ nieAuthEnabled: !!process.env.NIE_AUTH_API_URL });
}
