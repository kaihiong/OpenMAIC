/**
 * Edge-compatible JWT utilities (HS256 via Web Crypto API).
 * Works in both Next.js middleware (Edge runtime) and API routes (Node.js).
 */

export interface SessionUser {
  userId: string;
  name: string;
  email: string;
  department: string;
}

export const COOKIE_NAME = 'openmaic_session';
const EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signJWT(user: SessionUser): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ ...user, iat: now, exp: now + EXPIRY_SECONDS }),
    ),
  );
  const input = `${header}.${payload}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

export async function verifyJWT(token: string): Promise<SessionUser | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(sig),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      userId: claims.userId,
      name: claims.name,
      email: claims.email,
      department: claims.department,
    };
  } catch {
    return null;
  }
}
