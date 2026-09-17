/**
 * Attributes for the NIE session cookie.
 *
 * When this deployment is embedded in another site — the NIE AI Workspace
 * renders OpenMAIC in an iframe — the session cookie has to survive a
 * cross-site frame. Chrome neither stores nor sends a SameSite=Lax cookie
 * there, so the login inside the frame would appear to succeed and then bounce
 * straight back to /login.
 *
 * Embedded deployments therefore need SameSite=None with Secure, plus
 * Partitioned (CHIPS) so the frame's session stays keyed to the embedding site
 * rather than becoming an ambient third-party cookie.
 *
 * The switch is ALLOWED_FRAME_ANCESTORS, the same variable that opens up
 * frame-ancestors. Note it is needed in two places for a full embed: as a
 * docker build arg (Next bakes headers() into routes-manifest.json at build
 * time) and as a runtime env var on the host, which is what this reads.
 */
export function sessionCookieOptions() {
  const embeddable = !!process.env.ALLOWED_FRAME_ANCESTORS?.trim();

  return {
    httpOnly: true,
    path: '/',
    sameSite: embeddable ? ('none' as const) : ('lax' as const),
    // SameSite=None is only honoured on a secure context. Chrome treats
    // http://localhost as trustworthy, so dev embedding still works.
    secure: embeddable || process.env.NODE_ENV === 'production',
    ...(embeddable ? { partitioned: true } : {}),
  };
}
