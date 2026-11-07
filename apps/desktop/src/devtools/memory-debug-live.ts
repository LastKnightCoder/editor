import type { MemoryDebugPush, MemoryDebugSnapshot } from "@/types/assistant-memory-debug";

export function newerMemorySnapshot(
  current: MemoryDebugSnapshot | undefined,
  incoming: MemoryDebugSnapshot
) {
  if (!current || current.connectionId !== incoming.connectionId) return incoming;
  if (
    incoming.revision < current.revision ||
    (incoming.revision === current.revision && incoming.capturedAt < current.capturedAt)
  )
    return current;
  return current.contentRevision === incoming.contentRevision
    ? { ...incoming, data: { ...current.data, progress: incoming.data.progress } }
    : incoming;
}

export interface MemoryDebugStreamOptions {
  databaseName: string;
  connectionId: string;
  subscriptionId: string;
  listen: (listener: (push: MemoryDebugPush) => void) => () => void;
  subscribe: (id: string) => Promise<unknown>;
  unsubscribe: (id: string) => Promise<unknown>;
  receive: (snapshot: MemoryDebugSnapshot) => void;
  closed: () => void;
  failed: (error: unknown) => void;
}

export function startMemoryDebugStream(options: MemoryDebugStreamOptions) {
  let active = true;
  let acknowledged = false;
  let released = false;
  const release = () => {
    if (!acknowledged || released) return;
    released = true;
    void options.unsubscribe(options.subscriptionId).catch(() => undefined);
  };
  const disposeListener = options.listen(push => {
    if (
      !active ||
      push.subscriptionId !== options.subscriptionId ||
      push.databaseName.replace(/\.db$/i, "") !== options.databaseName.replace(/\.db$/i, "") ||
      push.connectionId !== options.connectionId
    )
      return;
    if (!push.snapshot) {
      options.closed();
      return;
    }
    if (push.snapshot.connectionId === options.connectionId) options.receive(push.snapshot);
  });
  void options
    .subscribe(options.subscriptionId)
    .then(() => {
      acknowledged = true;
      if (!active) release();
    })
    .catch(error => {
      if (active) options.failed(error);
    });
  return () => {
    active = false;
    disposeListener();
    release();
  };
}
