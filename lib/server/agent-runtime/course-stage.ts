import { createHash } from 'node:crypto';

/** Model-visible wording shared by every course-scoped tool schema. */
export const COURSE_STAGE_ID_DESCRIPTION =
  'Target stage id obtained from create_stage or list_folder_stages.';

/**
 * Deterministic stage id for one create-style tool call.
 *
 * A replay of the same durable call reuses its stage while a genuinely new
 * call gets a new id. `create_stage` uses this seam before the owner-bound
 * DocumentStore claims the document.
 */
export function stageIdForCall(sessionId: string, callId: string): string {
  // Fork: still deterministic (replays reuse the stage), but shaped as a
  // name-based UUID (version 8, RFC 9562) like every other course id.
  const bytes = createHash('sha256').update(`${sessionId}:${callId}`, 'utf-8').digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic folder id for one replayable create_folder call. */
export function folderIdForCall(sessionId: string, callId: string): string {
  const digest = createHash('sha256')
    .update(`folder:${sessionId}:${callId}`, 'utf-8')
    .digest('base64url');
  return `folder-${digest.slice(0, 10)}`;
}
