/**
 * Fork: who is an administrator.
 *
 * OPENMAIC_ADMIN_USERS is a comma-separated list of NIE user ids (e.g. `khoun`),
 * matched case-insensitively against the signed-in user's owner id
 * (`nie:<userId>`). Only the server decides this; the browser is told the
 * result through /api/auth/me and every admin route re-checks it.
 */
import { AUTHENTICATED_OWNER_HEADER } from '@/lib/server/agent-runtime/owner-header';

function adminOwnerIds(): Set<string> {
  return new Set(
    (process.env.OPENMAIC_ADMIN_USERS ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
      .map((id) => (id.startsWith('nie:') ? id : `nie:${id}`)),
  );
}

export function isAdminOwner(ownerId: string | undefined): boolean {
  return !!ownerId && adminOwnerIds().has(ownerId.toLowerCase());
}

/** The signed-in owner from the middleware-set header, if any. */
export function signedInOwner(headers: Headers): string | undefined {
  const value = headers.get(AUTHENTICATED_OWNER_HEADER)?.trim();
  return value?.startsWith('nie:') && value.length > 4 ? value : undefined;
}

/** Owner id when the request comes from an administrator, else undefined. */
export function adminOwnerFromHeaders(headers: Headers): string | undefined {
  const owner = signedInOwner(headers);
  return isAdminOwner(owner) ? owner : undefined;
}
