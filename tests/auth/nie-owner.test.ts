import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Fork: everything a signed-in NIE user creates is owned by `nie:<userId>`.
describe('NIE owner identity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('derives a stable owner id from the user id, falling back to email', async () => {
    const { nieOwnerId } = await import('@/lib/server/agent-runtime/owner-header');
    expect(nieOwnerId({ userId: 'KHoun', email: 'k@nie.edu.sg' })).toBe('nie:khoun');
    expect(nieOwnerId({ userId: '', email: 'K@NIE.edu.sg' })).toBe('nie:k@nie.edu.sg');
    expect(nieOwnerId({ userId: '', email: '' })).toBeUndefined();
  });

  it('uses the middleware-set owner header before the anonymous cookie', async () => {
    const { resolveRequestOwnerId } = await import('@/lib/server/agent-runtime/owner');
    const out = new Headers();
    const req = { headers: new Headers({ 'x-openmaic-owner': 'nie:khoun' }) };
    expect(resolveRequestOwnerId(req, out)).toBe('nie:khoun');
    expect(out.get('set-cookie')).toBeNull();
  });

  it('ignores a malformed owner header', async () => {
    const { resolveRequestOwnerId } = await import('@/lib/server/agent-runtime/owner');
    const req = { headers: new Headers({ 'x-openmaic-owner': 'anon:spoof' }) };
    expect(resolveRequestOwnerId(req, new Headers())).toMatch(/^anon:/);
  });

  it('recognises administrators only from OPENMAIC_ADMIN_USERS', async () => {
    vi.stubEnv('OPENMAIC_ADMIN_USERS', 'Khoun, someone');
    const { isAdminOwner } = await import('@/lib/server/admin/admins');
    expect(isAdminOwner('nie:khoun')).toBe(true);
    expect(isAdminOwner('nie:someone')).toBe(true);
    expect(isAdminOwner('nie:other')).toBe(false);
    expect(isAdminOwner(undefined)).toBe(false);
  });

  it('middleware drops a client-sent owner header and sets the verified one', async () => {
    vi.stubEnv('NIE_AUTH_API_URL', 'https://auth.example');
    vi.stubEnv('JWT_SECRET', 'test-secret');
    const { signJWT, COOKIE_NAME } = await import('@/lib/auth/jwt');
    const { middleware } = await import('@/middleware');

    const forged = await middleware(
      new NextRequest('http://localhost/api/stages', {
        headers: { 'x-openmaic-owner': 'nie:khoun' },
      }),
    );
    expect(forged.status).toBe(401);

    const token = await signJWT({ userId: 'alice', name: 'A', email: 'a@x', department: 'D' });
    const ok = await middleware(
      new NextRequest('http://localhost/api/stages', {
        headers: { cookie: `${COOKIE_NAME}=${token}`, 'x-openmaic-owner': 'nie:khoun' },
      }),
    );
    expect(ok.headers.get('x-middleware-request-x-openmaic-owner')).toBe('nie:alice');
  });
});
