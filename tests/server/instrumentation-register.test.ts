import { afterEach, describe, expect, it, vi } from 'vitest';

const registerNode = vi.fn(async () => {});
vi.mock('../../instrumentation.node', () => ({ register: registerNode }));

describe('instrumentation register (fork)', () => {
  const runtime = process.env.NEXT_RUNTIME;
  afterEach(() => {
    process.env.NEXT_RUNTIME = runtime;
    registerNode.mockClear();
  });

  it('runs the Node startup (agent runner, schedules) on the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs';
    const { register } = await import('../../instrumentation');
    await register();
    expect(registerNode).toHaveBeenCalledTimes(1);
  });

  it('does nothing on the edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    const { register } = await import('../../instrumentation');
    await register();
    expect(registerNode).not.toHaveBeenCalled();
  });
});
