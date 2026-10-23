import type { SettingCompat } from "../types";

let writes: Promise<unknown> = Promise.resolve();

export function enqueueProviderConfigWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes
    .catch(() => undefined)
    .then(operation)
    .catch(issue => {
      if (issue instanceof Error) throw issue;
      throw new Error(String(issue));
    });
  writes = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}
export function flushProviderConfigWrites(): Promise<unknown> {
  return writes;
}

export function mergeProviderSettings(
  previous: SettingCompat,
  snapshot: SettingCompat
): SettingCompat {
  return {
    ...previous,
    database: snapshot.database,
    sync: { ...previous.sync, active: snapshot.sync.active, plugin: snapshot.sync.plugin },
    imageBed: {
      ...previous.imageBed,
      active: snapshot.imageBed.active,
      plugin: snapshot.imageBed.plugin,
    },
  };
}
