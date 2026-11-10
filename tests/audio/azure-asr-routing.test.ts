import { describe, expect, it, vi } from 'vitest';

// Fork additions: Azure OpenAI transcription routing and request fixes.
describe('azureOpenAIResourceRoot', () => {
  it('recognises Azure OpenAI base URLs in every common form', async () => {
    const { azureOpenAIResourceRoot } = await import('@/lib/audio/asr-providers');
    const root = 'https://sandbox-oai-instance-08.openai.azure.com';
    expect(azureOpenAIResourceRoot(`${root}/openai/v1`)).toBe(root);
    expect(azureOpenAIResourceRoot(`${root}/openai/v1/`)).toBe(root);
    expect(azureOpenAIResourceRoot(`${root}/openai`)).toBe(root);
    expect(azureOpenAIResourceRoot(root)).toBe(root);
  });

  it('ignores non-Azure base URLs', async () => {
    const { azureOpenAIResourceRoot } = await import('@/lib/audio/asr-providers');
    expect(azureOpenAIResourceRoot('https://api.openai.com/v1')).toBeUndefined();
    expect(azureOpenAIResourceRoot('https://evil.example/openai.azure.com')).toBeUndefined();
    expect(azureOpenAIResourceRoot(undefined)).toBeUndefined();
  });
});
