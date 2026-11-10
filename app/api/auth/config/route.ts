import { apiSuccess } from '@/lib/server/api-response';

export async function GET() {
  // Fork: apps allowed to embed OpenMAIC may also launch lessons and receive their link back
  // (lib/workbench/launch-return.ts). Origins only; paths and wildcards are dropped.
  const launchOrigins = (process.env.ALLOWED_FRAME_ANCESTORS ?? '')
    .split(/\s+/)
    .map((entry) => {
      try {
        return entry.includes('*') ? null : new URL(entry).origin;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => !!origin);
  return apiSuccess({ nieAuthEnabled: !!process.env.NIE_AUTH_API_URL, launchOrigins });
}
