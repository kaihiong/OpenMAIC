/**
 * Fork: tell the app that launched a Pro lesson (ALEX+'s "Open in OpenMAIC") where the
 * lesson lives, so it can save a link back to it.
 *
 * The launcher opens `/workbench/new?prompt=…&returnOrigin=<its origin>&launch=<nonce>` in a
 * new tab, keeping `window.opener`. Once the session exists we post
 *   { type: 'openmaic:lesson-link', launch, sessionId, courseId: null, url, editUrl }
 * to the opener, and again with the course page (`/classroom/<id>`) when the agent creates it.
 *
 * Only origins listed in ALLOWED_FRAME_ANCESTORS (the same apps allowed to embed OpenMAIC)
 * receive the message; the server reports that list from /api/auth/config. The message
 * carries only ids and a link, which still needs an OpenMAIC sign-in to open.
 */

const PENDING_KEY = 'openmaic:launch-return';
export const LAUNCH_LINK_MESSAGE = 'openmaic:lesson-link';

interface PendingLaunchReturn {
  launch: string;
  origin: string;
  sessionId: string;
  courseSent: boolean;
}

let allowedOriginsPromise: Promise<string[]> | null = null;

function allowedOrigins(): Promise<string[]> {
  allowedOriginsPromise ??= fetch('/api/auth/config')
    .then((res) => res.json())
    .then((body: { data?: { launchOrigins?: unknown }; launchOrigins?: unknown }) => {
      const list = body.data?.launchOrigins ?? body.launchOrigins;
      return Array.isArray(list) ? list.filter((o): o is string => typeof o === 'string') : [];
    })
    .catch(() => []);
  return allowedOriginsPromise;
}

function post(pending: PendingLaunchReturn, courseId: string | null) {
  const opener = window.opener as Window | null;
  if (!opener || opener.closed) return false;
  const origin = window.location.origin;
  const session = encodeURIComponent(pending.sessionId);
  // editUrl: the Pro workspace with the agent conversation and (once made) the course beside it.
  const editUrl = courseId
    ? `${origin}/workspace?session=${session}&course=${encodeURIComponent(courseId)}`
    : `${origin}/workspace?session=${session}`;
  // url: the course page to view or share; the workspace until the course exists.
  const url = courseId ? `${origin}/classroom/${encodeURIComponent(courseId)}` : editUrl;
  opener.postMessage(
    { type: LAUNCH_LINK_MESSAGE, launch: pending.launch, sessionId: pending.sessionId, courseId, url, editUrl },
    pending.origin,
  );
  return true;
}

function readPending(): PendingLaunchReturn | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingLaunchReturn) : null;
  } catch {
    return null;
  }
}

function writePending(value: PendingLaunchReturn | null) {
  try {
    if (value) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the session link was still sent; the course link is skipped.
  }
}

/** Called by the launch bridge once the Pro session exists. */
export async function announceLaunchedSession(
  sessionId: string,
  returnOrigin: string | null,
  launch: string | null,
): Promise<void> {
  if (!returnOrigin || !launch || typeof window === 'undefined' || !window.opener) return;
  let origin: string;
  try {
    origin = new URL(returnOrigin).origin;
  } catch {
    return;
  }
  if (!(await allowedOrigins()).includes(origin)) return;
  const pending: PendingLaunchReturn = { launch: launch.slice(0, 100), origin, sessionId, courseSent: false };
  if (post(pending, null)) writePending(pending);
}

/** Called by the workspace when the attached session's course id is known. */
export function announceLaunchedCourse(sessionId: string | null, courseId: string | null): void {
  if (!sessionId || !courseId || typeof window === 'undefined') return;
  const pending = readPending();
  if (!pending || pending.sessionId !== sessionId || pending.courseSent) return;
  post(pending, courseId);
  writePending(null);
}
