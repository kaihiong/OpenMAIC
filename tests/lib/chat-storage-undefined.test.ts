import { describe, expect, it } from 'vitest';
import { withoutUndefinedMembers } from '@/lib/utils/chat-storage';

// Fork: the server runtime store rejects `undefined` members (plain JSON only).
describe('withoutUndefinedMembers', () => {
  it('drops undefined members deeply, keeping everything else', () => {
    const input = {
      parts: [{ input: { elementId: 'a', dimOpacity: undefined, level: 0 } }],
      note: null,
      when: new Date(0),
    };
    const out = withoutUndefinedMembers(input);
    expect(out.parts[0].input).toEqual({ elementId: 'a', level: 0 });
    expect('dimOpacity' in out.parts[0].input).toBe(false);
    expect(out.note).toBeNull();
    expect(out.when).toBe(input.when);
  });
});
