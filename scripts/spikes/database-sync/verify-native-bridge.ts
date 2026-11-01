type Bridge = (command: string, args: Record<string, unknown>) => Promise<unknown>;
export function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return (globalThis as unknown as { __deviceSyncNative: Bridge }).__deviceSyncNative(
    command,
    args
  ) as Promise<T>;
}
const events = new Map<string, Set<() => void>>();
export async function listen(name: string, receive: () => void) {
  const entries = events.get(name) ?? new Set();
  entries.add(receive);
  events.set(name, entries);
  return () => {
    entries.delete(receive);
  };
}
export function emitNativeResume() {
  for (const receive of events.get("device-sync-resume") ?? []) receive();
}
