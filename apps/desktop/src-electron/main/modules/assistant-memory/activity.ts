import type { MemorySource } from "@/types/assistant-memory";

type ChangeListener = (database: string, source: MemorySource, resetHistory?: boolean) => void;
const changes = new Set<ChangeListener>();
const foreground = new Set<string>();
const activity = new Set<(busy: boolean) => void>();

export const onMemorySourceChanged = (listener: ChangeListener) => {
  changes.add(listener);
  return () => {
    changes.delete(listener);
  };
};
export const emitMemorySourceChanged = (
  database: string,
  source: MemorySource,
  resetHistory = false
) => {
  for (const listener of changes) listener(database, source, resetHistory);
};
export const memoryForegroundBusy = () => foreground.size > 0;
export const onMemoryForeground = (listener: (busy: boolean) => void) => {
  activity.add(listener);
  return () => {
    activity.delete(listener);
  };
};
export function setMemoryForeground(id: string, busy: boolean) {
  const wasBusy = memoryForegroundBusy();
  if (busy) foreground.add(id);
  else foreground.delete(id);
  const nowBusy = memoryForegroundBusy();
  if (wasBusy !== nowBusy) for (const listener of activity) listener(nowBusy);
}
