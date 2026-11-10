/**
 * Fork: one-time copy of courses saved in this browser into the signed-in
 * user's server account.
 *
 * Before server storage was switched on, courses lived only in the browser's
 * `maic-documents` IndexedDB store. With server storage on, the home page lists
 * the server only, and upstream's lazy migration reads the older Dexie tables,
 * not this store — so those courses would silently disappear from view. This
 * module finds them and saves each one through the server document store,
 * which records the signed-in NIE user as owner (the browser never chooses it).
 *
 * Safety:
 *  - Browser copies are never deleted; this only adds server copies.
 *  - A course already on the server (same id) is left alone.
 *  - Completed ids are remembered per browser, so the work is done once.
 *  - Failures are reported, not thrown: a broken course never blocks the page.
 *
 * Narration audio and images stay in this browser's media tables; the player
 * falls back to them, so migrated courses play fully on this device. Copying
 * media to the server (for other devices) is a separate, later step.
 */
import { BrowserDocumentStore } from '@openmaic/storage';

import type { AppScene } from '@/lib/types/stage';
import { getDocumentStore } from '@/lib/document-store';
import type { AppStage } from '@/lib/document-store/persistence-types';
import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { isBrowserPersistenceEnabled } from '@/lib/persistence/bootstrap';
import { createLogger } from '@/lib/logger';

const log = createLogger('BrowserCourseMigration');

/** The browser document store courses lived in before server storage. */
const BROWSER_DOCUMENT_DB = 'maic-documents';
/** Per-browser record of course ids already copied (or already on the server). */
const DONE_KEY = 'openmaic.browserCourseMigration.done';

export interface BrowserCourseMigrationResult {
  /** Courses copied to the server in this run. */
  migrated: { id: string; name: string }[];
  /** Courses that could not be copied, with the reason. */
  failed: { id: string; name: string; reason: string }[];
}

function readDone(): Set<string> {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeDone(done: Set<string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    // Storage unavailable: the next run re-checks against the server instead.
  }
}

async function browserStoreExists(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases !== 'function') return true; // cannot tell; try
  const dbs = await indexedDB.databases();
  return dbs.some((db) => db.name === BROWSER_DOCUMENT_DB);
}

async function serverCourseIds(): Promise<Set<string>> {
  const res = await fetch('/api/stages', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not list server courses (HTTP ${res.status})`);
  const body = (await res.json()) as { stages?: { id: string }[] };
  return new Set((body.stages ?? []).map((stage) => stage.id));
}

let running: Promise<BrowserCourseMigrationResult> | null = null;

/**
 * Copy this browser's courses that are not yet on the server. Safe to call on
 * every page load: concurrent calls share one run, and finished courses are
 * skipped without touching IndexedDB again.
 */
export function migrateBrowserCourses(): Promise<BrowserCourseMigrationResult> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<BrowserCourseMigrationResult> {
  const result: BrowserCourseMigrationResult = { migrated: [], failed: [] };
  if (!isBrowserPersistenceEnabled() || !(await browserStoreExists())) return result;

  const local = new BrowserDocumentStore<AppScene, AppStage>({
    dbName: BROWSER_DOCUMENT_DB,
    validateScene: validateAppScene,
    validateStage: validateAppStage,
  });
  const summaries = await local.listDocuments();
  const done = readDone();
  const pending = summaries.filter((summary) => !done.has(summary.id));
  if (pending.length === 0) return result;

  const onServer = await serverCourseIds();
  const server = getDocumentStore();

  for (const summary of pending) {
    const name = summary.name || 'Untitled course';
    if (onServer.has(summary.id)) {
      done.add(summary.id);
      continue;
    }
    try {
      const doc = await local.loadDocument(summary.id);
      if (!doc) {
        done.add(summary.id); // listed but empty: nothing to copy
        continue;
      }
      await server.saveDocument(doc);
      done.add(summary.id);
      result.migrated.push({ id: summary.id, name });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn(`Could not copy course ${summary.id} to the server:`, error);
      result.failed.push({ id: summary.id, name, reason });
    }
  }

  writeDone(done);
  return result;
}
