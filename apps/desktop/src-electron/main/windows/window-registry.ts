import type { BrowserWindow } from "electron";
import { revealWindow } from "./create-window";

/**
 * 键控窗口表：同一 key 只存在一个窗口，关闭后自动注销。
 * key 以「类型:」为前缀（如 "editor:article:db:42"），便于按类型枚举。
 */
const windows = new Map<string, BrowserWindow>();

export function findWindow(key: string): BrowserWindow | undefined {
  const win = windows.get(key);
  if (win && !win.isDestroyed()) return win;
  windows.delete(key);
  return undefined;
}

export function windowsWithPrefix(prefix: string): BrowserWindow[] {
  return [...windows.entries()]
    .filter(([key, win]) => key.startsWith(prefix) && !win.isDestroyed())
    .map(([, win]) => win);
}

export function registerWindow(key: string, win: BrowserWindow) {
  windows.set(key, win);
  win.on("closed", () => {
    if (windows.get(key) === win) windows.delete(key);
  });
}

/** 已有则聚焦并返回 true；否则返回 false 交给调用方创建 */
export function focusExisting(key: string): boolean {
  const win = findWindow(key);
  if (!win) return false;
  revealWindow(win);
  return true;
}
