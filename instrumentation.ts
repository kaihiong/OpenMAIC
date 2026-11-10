/**
 * Runtime-specific startup loader. Keep the Node-only dependency graph in its
 * own module so the browser/edge instrumentation bundle never resolves Node
 * built-ins imported by the background workers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fork fix: importing the module is not enough; its `register` installs the
    // agent runner, material extraction, asset collector and config checks.
    const { register: registerNode } = await import('./instrumentation.node');
    await registerNode();
  }
}
