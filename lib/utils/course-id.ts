/**
 * Fork: course (stage) ids are UUIDs.
 *
 * A course id is also its share link: any signed-in user who has it can open
 * the course read-only. A random UUID v4 carries 122 bits of randomness, far
 * beyond guessing, and is the familiar format for links. Works in the browser
 * and on the server (Web Crypto). Existing courses keep their older ids.
 */
export function newCourseId(): string {
  return crypto.randomUUID();
}

/** Lower-case canonical UUID (any version). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
