/**
 * 待办页偏好（localStorage）：跨会话记住上次的项目筛选与分段方式，重启后恢复。
 * 筛选只存 id 字符串；项目被归档/删除后由视图侧守卫回退到全部，残留旧 id 无害。
 */

import type { AgendaMode } from "./components/AgendaPanel";

const KEY = "tau-todos-preferences";

type TodosPreferences = { groupFilter?: unknown; mode?: unknown };

function readAll(): TodosPreferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" ? (value as TodosPreferences) : {};
  } catch {
    return {};
  }
}

function patch(next: TodosPreferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), ...next }));
  } catch {
    // 存储不可用时静默跳过，偏好丢失不影响功能
  }
}

export function readSavedGroupFilter(): string | null {
  const { groupFilter } = readAll();
  return typeof groupFilter === "string" ? groupFilter : null;
}

export function saveGroupFilter(id: string): void {
  patch({ groupFilter: id });
}

export function readSavedMode(): AgendaMode {
  return readAll().mode === "group" ? "group" : "date";
}

export function saveMode(mode: AgendaMode): void {
  patch({ mode });
}
