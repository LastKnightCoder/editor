/**
 * 待办页偏好（localStorage）：跨会话记住上次的项目筛选，重启后无参进入时恢复。
 * 偏好只存 id 字符串；项目被归档/删除后由视图侧守卫回退到全部，残留旧 id 无害。
 */

const KEY = "tau-todos-preferences";

export function readSavedGroupFilter(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value &&
      typeof value === "object" &&
      typeof (value as { groupFilter?: unknown }).groupFilter === "string"
      ? (value as { groupFilter: string }).groupFilter
      : null;
  } catch {
    return null;
  }
}

export function saveGroupFilter(id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ groupFilter: id }));
  } catch {
    // 存储不可用时静默跳过，偏好丢失不影响功能
  }
}
