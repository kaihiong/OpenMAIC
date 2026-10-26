/**
 * Runtime-specific startup loader. Keep the Node-only dependency graph in its
 * own module so the browser/edge instrumentation bundle never resolves Node
 * built-ins imported by the background workers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
