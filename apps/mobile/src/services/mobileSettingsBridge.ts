import type { SettingCompat } from "../types";

type SettingListener = () => void;

let snapshot: SettingCompat | null = null;
const listeners = new Set<SettingListener>();

export function setMobileSettingSnapshot(next: SettingCompat | null): void {
  snapshot = next;
  listeners.forEach((listener) => {
    listener();
  });
}

export function getMobileSettingSnapshot(): SettingCompat | null {
  return snapshot;
}

export function getMobileSettingByPath<T = unknown>(
  path: string,
): T | undefined {
  if (!snapshot) {
    return undefined;
  }
  if (!path) {
    return snapshot as T;
  }
  const segments = path.split(".").filter(Boolean);
  let current: unknown = snapshot;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T;
}

export function subscribeMobileSettingSnapshot(
  listener: SettingListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
