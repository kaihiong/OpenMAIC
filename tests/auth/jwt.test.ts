import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signJWT, verifyJWT, type SessionUser } from '@/lib/auth/jwt';

const sessionUser: SessionUser = {
  userId: 'nie-user-1',
  name: 'NIE User',
  email: 'nie-user@nie.edu.sg',
  department: 'Academic Computing',
};

describe('NIE session JWT', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.JWT_SECRET;
  });

  it('round-trips authenticated user claims', async () => {
    const token = await signJWT(sessionUser);

    await expect(verifyJWT(token)).resolves.toEqual(sessionUser);
  });

  it('rejects a token with a tampered signature', async () => {
    const token = await signJWT(sessionUser);
    const replacement = token.endsWith('A') ? 'B' : 'A';
    const tampered = `${token.slice(0, -1)}${replacement}`;

    await expect(verifyJWT(tampered)).resolves.toBeNull();
  });

  it('rejects an expired session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T00:00:00Z'));
    const token = await signJWT(sessionUser);

    vi.setSystemTime(new Date('2026-05-19T08:00:01Z'));

    await expect(verifyJWT(token)).resolves.toBeNull();
  });

  it('does not verify sessions when the server secret is unavailable', async () => {
    const token = await signJWT(sessionUser);
    delete process.env.JWT_SECRET;

    await expect(verifyJWT(token)).resolves.toBeNull();
  });

  it('does not issue sessions when the server secret is unavailable', async () => {
    delete process.env.JWT_SECRET;

    await expect(signJWT(sessionUser)).rejects.toThrow('JWT_SECRET not configured');
  });
});
