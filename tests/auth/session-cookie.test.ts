import { afterEach, describe, expect, it, vi } from 'vitest';

import { sessionCookieOptions } from '@/lib/auth/session-cookie';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sessionCookieOptions', () => {
  it('stays SameSite=Lax when the deployment is not embeddable', () => {
    vi.stubEnv('ALLOWED_FRAME_ANCESTORS', '');

    const options = sessionCookieOptions();

    expect(options.sameSite).toBe('lax');
    expect(options).not.toHaveProperty('partitioned');
  });

  it('treats a whitespace-only allow-list as not embeddable', () => {
    vi.stubEnv('ALLOWED_FRAME_ANCESTORS', '   ');

    expect(sessionCookieOptions().sameSite).toBe('lax');
  });

  it('switches to SameSite=None, Secure and Partitioned when embeddable', () => {
    vi.stubEnv('ALLOWED_FRAME_ANCESTORS', 'http://localhost:8001');

    const options = sessionCookieOptions();

    // A Lax cookie is neither stored nor sent inside a cross-site iframe, so
    // the embedded login would bounce straight back to /login.
    expect(options.sameSite).toBe('none');
    expect(options.secure).toBe(true);
    expect(options).toHaveProperty('partitioned', true);
  });

  it('keeps the cookie httpOnly and root-scoped either way', () => {
    vi.stubEnv('ALLOWED_FRAME_ANCESTORS', 'https://aiworkspace.nie.edu.sg');

    const embedded = sessionCookieOptions();

    vi.stubEnv('ALLOWED_FRAME_ANCESTORS', '');
    const standalone = sessionCookieOptions();

    for (const options of [embedded, standalone]) {
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/');
    }
  });
});
