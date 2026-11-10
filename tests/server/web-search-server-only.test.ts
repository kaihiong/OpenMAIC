import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fork addition: server-providers-only mode keeps web search to the provider
// the server manages (no key-less Brave HTML scraping, no user keys).
describe('web search in server-providers-only mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const key of Object.keys(process.env)) {
      if (/^(TAVILY|BRAVE|EXA|SEARXNG|BOCHA|BAIDU)_|^WEB_SEARCH_/.test(key)) vi.stubEnv(key, '');
    }
  });

  it('uses the server-managed provider instead of a requested unmanaged one', async () => {
    vi.stubEnv('OPENMAIC_SERVER_PROVIDERS_ONLY', 'true');
    vi.stubEnv('TAVILY_API_KEY', 'tvly-server');
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');
    expect(resolveClassroomWebSearchConfig({ webSearchProviderId: 'brave' })).toMatchObject({
      providerId: 'tavily',
      apiKey: 'tvly-server',
    });
  });

  it('offers no web search when the server manages none', async () => {
    vi.stubEnv('OPENMAIC_SERVER_PROVIDERS_ONLY', 'true');
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');
    expect(resolveClassroomWebSearchConfig({ webSearchProviderId: 'brave' })).toBeUndefined();
  });

  it('keeps upstream behaviour when the mode is off', async () => {
    const { resolveClassroomWebSearchConfig } = await import('@/lib/server/web-search-config');
    expect(resolveClassroomWebSearchConfig({ webSearchProviderId: 'brave' })).toMatchObject({
      providerId: 'brave',
    });
  });
});
