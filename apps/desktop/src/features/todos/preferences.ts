/**
 * 待办页偏好（localStorage）：跨会话记住上次的项目筛选与分段方式，重启后恢复。
 * 筛选只存 id 字符串；项目被归档/删除后由视图侧守卫回退到全部，残留旧 id 无害。
 */

import type { AgendaMode } from "./components/AgendaPanel";
import { logThrottled } from "@/utils/throttled-log";

const KEY = "tau-todos-preferences";

type TodosPreferences = { groupFilter?: unknown; mode?: unknown };

function readAll(): TodosPreferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" ? (value as TodosPreferences) : {};
  } catch (error) {
    // 每次渲染都会读，损坏的值会反复走到这里：按来源节流
    logThrottled(
      "todos-preferences-read",
      "warn",
      "[todos] 待办偏好读取失败，按默认处理",
      undefined,
      error
    );
    return {};
  }
}

function patch(next: TodosPreferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), ...next }));
  } catch (error) {
    // 偏好丢失不影响功能，但筛选与分段方式会在重启后回到默认
    logThrottled("todos-preferences-write", "warn", "[todos] 待办偏好保存失败", undefined, error);
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
  const mode = readAll().mode;
  return mode === "group" || mode === "priority" ? mode : "date";
}

export function saveMode(mode: AgendaMode): void {
  patch({ mode });
}
