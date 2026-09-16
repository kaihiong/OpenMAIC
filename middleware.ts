import { NextRequest, NextResponse } from 'next/server';

import { verifyJWT, COOKIE_NAME } from '@/lib/auth/jwt';
import { isAgentRuntimeConfigured, isProWorkbenchEnabled } from '@/lib/config/feature-flags';
import { verifyAccessTokenEdge } from '@/lib/server/access-token-edge';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Return an actual server-side 404 when either half of the workbench is off.
  // Edge middleware cannot reliably inspect server-only deployment variables,
  // so it enforces the public gate and leaves the complete runtime/database
  // check to Node. A Node-hosted middleware uses the same gate as startup.
  const canInspectServerRuntime = process.env.NEXT_RUNTIME !== 'edge';
  const workbenchEnabled =
    isProWorkbenchEnabled() && (!canInspectServerRuntime || isAgentRuntimeConfigured());
  if (!workbenchEnabled && (pathname === '/workbench' || pathname.startsWith('/workbench/'))) {
    return new NextResponse('Not found', { status: 404 });
  }

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
    if (cookie?.value && (await verifyAccessTokenEdge(cookie.value, accessCode))) {
      return NextResponse.next();
    }

    // API requests without valid cookie → 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
        { status: 401 },
      );
    }

    // Page requests → let through, frontend shows modal
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|nie-logo\\.svg).*)'],
};
