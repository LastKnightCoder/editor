/**
 * AI 任务通知统一分流与可见面抑制：
 * - 应用聚焦且用户正在看对应可见面 → 抑制不发；
 * - 应用聚焦但不在对应可见面 → 走 appNotify 落应用内卡栈；
 * - 应用失焦 → 走 appNotify 落系统独立通知窗（/notification-host）。
 *
 * 弹窗/模态内运行的任务传 mode="unfocused-only"：窗口聚焦时始终抑制，仅应用失焦时提醒。
 */

import { useSettingsStore, type SettingsLocation } from "@/app/settingsStore";
import { getPageNavigation } from "@/services/page-navigation";
import useSettingStore from "@/stores/useSettingStore";
import { aiNotifyText } from "./ai.i18n";
import { appNotify, type AppNotifyAction, type AppNotifyOptions } from "./notify";

export const CHAT_TURN_MIN_ELAPSED_MS = 5_000;

export interface AiNotifyOptions extends AppNotifyOptions {
  /**
   * away-from-surface（默认）：聚焦且在可见面抑制，否则按焦点路由到应用内或系统窗口。
   * unfocused-only：仅应用失焦时发送（适合无法切页的弹窗内任务）。
   */
  mode?: "away-from-surface" | "unfocused-only";
  /** 返回 true 表示用户正在看着该任务对应的可见面 */
  isOnSurface?: () => boolean;
  /** 实际耗时（毫秒）；配合 minElapsedMs 抑制过快的纯完成通知 */
  elapsedMs?: number;
  /** 最短耗时门槛（毫秒）；sticky 与 danger 通知不受门槛限制 */
  minElapsedMs?: number;
  /** 发起时的数据库名；存在时为 reveal 动作加切库保护 */
  databaseName?: string;
}

const activeSurfaces = new Map<string, number>();
const activeNoticeIds = new Set<string>();

export function normalizeDbName(name: string | undefined): string {
  return (name ?? "").replace(/\.db$/, "");
}

export function currentDatabaseName(): string {
  return useSettingStore.getState().setting.database.active;
}

export function isCurrentDatabase(databaseName: string): boolean {
  return normalizeDbName(currentDatabaseName()) === normalizeDbName(databaseName);
}

export function assertCurrentDatabase(databaseName: string): void {
  if (!isCurrentDatabase(databaseName)) throw new Error(aiNotifyText("error.wrongDatabase"));
}

export function isWindowAttended(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

export function registerActiveSurface(surfaceKey: string): () => void {
  activeSurfaces.set(surfaceKey, (activeSurfaces.get(surfaceKey) ?? 0) + 1);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const next = (activeSurfaces.get(surfaceKey) ?? 1) - 1;
    if (next <= 0) activeSurfaces.delete(surfaceKey);
    else activeSurfaces.set(surfaceKey, next);
  };
}

export function isSurfaceActive(surfaceKey: string): boolean {
  return (activeSurfaces.get(surfaceKey) ?? 0) > 0;
}

export function isViewingPage(
  key: string,
  matchParams?: (params: Record<string, unknown>) => boolean
): boolean {
  if (useSettingsStore.getState().open) return false;
  try {
    const top = getPageNavigation().state.back.at(-1);
    if (!top || top.key !== key) return false;
    return matchParams ? matchParams(top.params) : true;
  } catch {
    return false;
  }
}

export function isViewingSettings(section?: SettingsLocation): boolean {
  const settings = useSettingsStore.getState();
  if (!settings.open) return false;
  return section ? settings.section === section : true;
}

/** 切库保护：任务通知跳回原目标前校验当前库未切换 */
export function guardDatabaseAction(
  databaseName: string | undefined,
  action: (() => unknown) | undefined
): (() => unknown) | undefined {
  if (!action || !databaseName) return action;
  return () => {
    assertCurrentDatabase(databaseName);
    return action();
  };
}

function wrapActions(
  actions: AppNotifyAction[] | undefined,
  databaseName: string | undefined
): AppNotifyAction[] | undefined {
  return actions?.map(action => {
    if (!action.reveal) return action;
    return {
      ...action,
      onClick: guardDatabaseAction(databaseName, () => {
        useSettingsStore.getState().closeSettings();
        return action.onClick?.();
      }),
    };
  });
}

export function notifyAiTask(options: AiNotifyOptions): string | null {
  const {
    mode = "away-from-surface",
    isOnSurface,
    elapsedMs,
    minElapsedMs,
    databaseName,
    actions,
    ...notifyOptions
  } = options;

  // 切库后迟到的旧任务结果不能重新创建已撤销的通知。
  if (databaseName && !isCurrentDatabase(databaseName)) return null;

  const attended = isWindowAttended();
  if (mode === "unfocused-only") {
    if (attended) return null;
  } else if (attended && isOnSurface?.()) {
    return null;
  }

  const bypassElapsed = Boolean(notifyOptions.sticky) || notifyOptions.tone === "danger";
  if (
    !bypassElapsed &&
    minElapsedMs !== undefined &&
    elapsedMs !== undefined &&
    elapsedMs < minElapsedMs
  ) {
    return null;
  }

  const id = appNotify({
    ...notifyOptions,
    actions: wrapActions(actions, databaseName),
  });
  activeNoticeIds.add(id);
  return id;
}

export function dismissAiNotice(id: string): void {
  activeNoticeIds.delete(id);
  appNotify.dismiss(id);
}

export function dismissAiNoticesByPrefix(prefix: string): void {
  for (const id of [...activeNoticeIds]) {
    if (!id.startsWith(prefix)) continue;
    activeNoticeIds.delete(id);
    appNotify.dismiss(id);
  }
}

export function dismissAllAiNotices(): void {
  for (const id of [...activeNoticeIds]) {
    activeNoticeIds.delete(id);
    appNotify.dismiss(id);
  }
}

/** 供单测重置内部跟踪态 */
export function resetAiNotifyState(): void {
  activeSurfaces.clear();
  activeNoticeIds.clear();
}
