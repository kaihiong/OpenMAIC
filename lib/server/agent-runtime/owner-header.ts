/**
 * Fork: identity of the signed-in NIE user, shared by middleware (Edge) and the
 * Node route handlers, so this module must stay free of Node-only imports.
 *
 * `middleware.ts` verifies the `openmaic_session` JWT and forwards the user's
 * owner id in AUTHENTICATED_OWNER_HEADER. It deletes any client-sent copy of the
 * header on every request, so a value that reaches a route handler is
 * server-controlled. `resolveRequestOwnerId` then makes that user the owner of
 * everything they create (courses, agent sessions, folders, materials).
 */
export const AUTHENTICATED_OWNER_HEADER = 'x-openmaic-owner';

/** Owner id for a verified NIE session user, or undefined when it has no stable id. */
export function nieOwnerId(user: { userId?: string; email?: string }): string | undefined {
  const id = (user.userId || user.email || '').trim().toLowerCase();
  return id ? `nie:${id}` : undefined;
}
