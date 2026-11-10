/**
 * Fork addition: voice limits of the original OpenAI TTS models as Azure OpenAI
 * deploys them (`tts`, `tts-hd`).
 *
 * The OpenAI TTS catalogue lists newer voices (ash, ballad, coral, sage, verse,
 * marin, cedar) that these deployments reject with HTTP 400. Verified against
 * an Azure `tts-hd` deployment on 2026-11-08: only the six classic voices below
 * succeed.
 */

/** Azure deployment names (and OpenAI ids) of the original TTS models. */
export const LEGACY_TTS_MODELS: ReadonlySet<string> = new Set([
  'tts',
  'tts-hd',
  'tts-1',
  'tts-1-hd',
]);

/** Voices the original TTS models accept. */
export const LEGACY_TTS_VOICES: readonly string[] = [
  'alloy',
  'echo',
  'fable',
  'nova',
  'onyx',
  'shimmer',
];

/**
 * Closest classic voice for each newer one, so a saved choice keeps a similar
 * character instead of failing.
 */
const LEGACY_VOICE_SUBSTITUTES: Record<string, string> = {
  ash: 'echo',
  ballad: 'fable',
  coral: 'shimmer',
  sage: 'nova',
  verse: 'onyx',
  marin: 'nova',
  cedar: 'onyx',
};

export function isLegacyTTSModel(modelId: string | undefined): boolean {
  return !!modelId && LEGACY_TTS_MODELS.has(modelId);
}

/** Whether `voiceId` works with `modelId` (only legacy models are restricted). */
export function isVoiceSupportedByTTSModel(modelId: string | undefined, voiceId: string): boolean {
  return !isLegacyTTSModel(modelId) || LEGACY_TTS_VOICES.includes(voiceId);
}

/**
 * Return a voice the model accepts: the voice itself when supported, otherwise
 * its closest classic substitute (or `alloy`). Non-legacy models pass through.
 */
export function coerceVoiceForTTSModel(modelId: string | undefined, voiceId: string): string {
  if (isVoiceSupportedByTTSModel(modelId, voiceId)) return voiceId;
  return LEGACY_VOICE_SUBSTITUTES[voiceId] ?? 'alloy';
}
