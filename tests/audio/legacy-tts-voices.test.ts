import { describe, expect, it } from 'vitest';
import {
  coerceVoiceForTTSModel,
  isVoiceSupportedByTTSModel,
  LEGACY_TTS_VOICES,
} from '@/lib/audio/legacy-tts-voices';

// Fork addition: Azure `tts` / `tts-hd` deployments accept only six voices.
describe('legacy TTS voices', () => {
  it('accepts the six classic voices on tts-hd', () => {
    for (const voice of LEGACY_TTS_VOICES) {
      expect(isVoiceSupportedByTTSModel('tts-hd', voice)).toBe(true);
      expect(coerceVoiceForTTSModel('tts-hd', voice)).toBe(voice);
    }
  });

  it('swaps a newer voice for its closest classic one on tts-hd', () => {
    expect(isVoiceSupportedByTTSModel('tts-hd', 'marin')).toBe(false);
    expect(coerceVoiceForTTSModel('tts-hd', 'marin')).toBe('nova');
    expect(coerceVoiceForTTSModel('tts-hd', 'coral')).toBe('shimmer');
    expect(coerceVoiceForTTSModel('tts', 'some-unknown-voice')).toBe('alloy');
  });

  it('leaves newer models untouched', () => {
    expect(isVoiceSupportedByTTSModel('gpt-4o-mini-tts', 'marin')).toBe(true);
    expect(coerceVoiceForTTSModel('gpt-4o-mini-tts', 'marin')).toBe('marin');
  });
});
