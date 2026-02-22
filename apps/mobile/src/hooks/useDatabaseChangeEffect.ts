import { useEffect, useRef } from "react";

export type DatabaseChangeReason = "switch" | "syncDownload";

export type DatabaseChangeEvent = {
  reason: DatabaseChangeReason;
  databaseName: string;
  localVersion?: number;
  remoteVersion?: number;
  timestamp: number;
};

type DatabaseChangeEffect = (
  event: DatabaseChangeEvent,
) => void | Promise<void>;

const listeners = new Set<DatabaseChangeEffect>();

function subscribeDatabaseChange(listener: DatabaseChangeEffect): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function emitDatabaseChange(
  event: DatabaseChangeEvent,
): Promise<PromiseSettledResult<void>[]> {
  const tasks = Array.from(listeners).map((listener) =>
    Promise.resolve().then(() => listener(event)),
  );
  return Promise.allSettled(tasks);
}

export function useDatabaseChangeEffect(
  callback: DatabaseChangeEffect,
  deps: React.DependencyList = [],
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const unsubscribe = subscribeDatabaseChange((event) =>
      callbackRef.current(event),
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
