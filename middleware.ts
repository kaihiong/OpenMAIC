import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth/jwt';

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed access-code token (legacy) */
async function verifyAccessCodeToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static/health always pass
  if (pathname === '/api/health') return NextResponse.next();

  const nieAuthConfigured = !!process.env.NIE_AUTH_API_URL;
  const accessCode = process.env.ACCESS_CODE;

  // --- NIE AD auth mode ---
  if (nieAuthConfigured) {
    // Whitelist: auth API routes and login page
    if (pathname.startsWith('/api/auth/') || pathname.startsWith('/login')) {
      return NextResponse.next();
    }

    const token = request.cookies.get(COOKIE_NAME)?.value;
    const user = token ? await verifyJWT(token) : null;

    if (user) return NextResponse.next();

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'UNAUTHORIZED', error: 'Not authenticated' },
        { status: 401 },
      );
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }

  // --- Legacy access code mode ---
  if (accessCode) {
    if (pathname.startsWith('/api/access-code/')) return NextResponse.next();

    const cookie = request.cookies.get('openmaic_access');
    if (cookie?.value && (await verifyAccessCodeToken(cookie.value, accessCode))) {
      return NextResponse.next();
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
        { status: 401 },
      );
    }

    return NextResponse.next();
  }

  // No auth configured — open access
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|nie-logo\\.svg).*)'],
};
