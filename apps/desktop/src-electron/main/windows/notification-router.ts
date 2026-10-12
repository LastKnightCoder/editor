import { BrowserWindow, webContents } from "electron";
import type {
  NotificationActionResult,
  NotificationRoute,
  NotificationRouteOptions,
  SystemNotificationPayload,
} from "@tau/platform";
import { revealWindow } from "./create-window";
import { showOrCreateMainWindow } from "./main-window";
import {
  dismissSystemNotification,
  NOTIFICATION_WINDOW_KEY,
  pushSystemNotification,
} from "./notification-window";
import { findWindow } from "./window-registry";

/**
 * 通知路由：失焦时通知进系统通知窗口（出生在哪就留在哪，两边栈互不同步），
 * 并为系统窗口里的卡保留回到来源端的作答回调路由（origin）。
 */

export type NotificationActionHandler = () => Promise<void> | void;

export type NotificationOrigin =
  | { kind: "window"; webContentsId: number }
  | { kind: "main"; handlers?: NotificationActionHandler[]; onClose?: () => void };

const systemIds = new Map<string, NotificationOrigin>();
/** main origin 直投 in-app 的卡：按钮留在主进程执行，关闭时收尾 */
const inAppHandlers = new Map<
  string,
  {
    handlers?: NotificationActionHandler[];
    onClose?: () => void;
  }
>();

/** run-action 应答表：requestId → pending promise */
const pendingRequests = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
>();
let requestSeq = 0;
const ACTION_TIMEOUT_MS = 60_000;

function windowFromWebContentsId(id: number): BrowserWindow | null {
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return null;
  return BrowserWindow.fromWebContents(wc);
}

/** 任一聚焦的普通 app 窗口（系统通知窗口自身不算） */
function focusedAppWindow(): BrowserWindow | undefined {
  const notificationWin = findWindow(NOTIFICATION_WINDOW_KEY);
  return BrowserWindow.getAllWindows().find(
    win => !win.isDestroyed() && win !== notificationWin && win.isFocused()
  );
}

/**
 * 裁决通知去向并完成推送：
 * - 已在系统窗口的 id：原位替换（同 id 重发 = 更新那张卡）并返回 "system"；
 * - window origin 聚焦 → "in-app"（不推送，由调用方渲染端自己入栈）；
 * - main origin 时若有聚焦窗口 → 直投该窗口返回 "in-app"；
 * - 其余（失焦）→ 推入系统窗口并登记 systemIds，返回 "system"。
 * options.force === "system" 跳过焦点判断直发系统窗口（调试工具用）；
 * origin 仍记发送方窗口，按钮作答经 run-action 回到本窗口执行。
 */
export function routeNotification(
  payload: SystemNotificationPayload,
  origin: NotificationOrigin,
  options?: NotificationRouteOptions
): NotificationRoute {
  if (systemIds.has(payload.id)) {
    systemIds.set(payload.id, origin);
    pushSystemNotification(
      payload,
      origin.kind === "window" ? windowFromWebContentsId(origin.webContentsId) : null
    );
    return "system";
  }
  if (origin.kind === "window") {
    const originWin = windowFromWebContentsId(origin.webContentsId);
    if (options?.force !== "system" && originWin?.isFocused()) return "in-app";
    systemIds.set(payload.id, origin);
    pushSystemNotification(payload, originWin);
    return "system";
  }
  const focused = focusedAppWindow();
  if (focused) {
    focused.webContents.send("notification:in-app", payload);
    inAppHandlers.set(payload.id, { handlers: origin.handlers, onClose: origin.onClose });
    return "in-app";
  }
  systemIds.set(payload.id, origin);
  pushSystemNotification(payload, null);
  return "system";
}

/** 业务侧主动关闭系统窗口中的一条：关窗 + 删登记（不经 onClose 收尾） */
export function dismissNotification(id: string) {
  if (!systemIds.delete(id)) return;
  dismissSystemNotification(id);
}

/** 系统窗口某卡关闭/退场：删登记；main origin 通知业务方收尾 */
export function closeNotificationCard(id: string) {
  const origin = systemIds.get(id);
  systemIds.delete(id);
  if (origin?.kind === "main") origin.onClose?.();
}

/** 系统窗口点击卡片主体：把来源窗口拉回前台 */
export function activateNotification(id: string) {
  const origin = systemIds.get(id);
  if (origin?.kind === "window") {
    const originWin = windowFromWebContentsId(origin.webContentsId);
    if (originWin) {
      revealWindow(originWin);
      return;
    }
  }
  showOrCreateMainWindow();
}

/**
 * 系统窗口执行按钮：window origin 经原窗口 webContents 转发并等待回报，
 * main origin 直接跑主进程 handler。原窗口已销毁/超时均 reject，由卡片展示错误。
 */
export async function runNotificationAction(id: string, index: number): Promise<void> {
  const origin = systemIds.get(id);
  if (!origin) throw new Error("通知不存在或已关闭");
  if (origin.kind === "main") {
    const handler = origin.handlers?.[index];
    if (!handler) throw new Error("通知动作不存在");
    return await handler();
  }
  const wc = webContents.fromId(origin.webContentsId);
  if (!wc || wc.isDestroyed()) throw new Error("原窗口已关闭");
  const requestId = `notification-action-${++requestSeq}`;
  return await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("通知动作执行超时"));
    }, ACTION_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timer });
    wc.send("notification:run-action", { requestId, id, index });
  });
}

/** 原窗口回报按钮执行结果（run-action 的应答） */
export function settleNotificationAction(result: NotificationActionResult) {
  const pending = pendingRequests.get(result.requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingRequests.delete(result.requestId);
  if (result.ok) pending.resolve();
  else pending.reject(new Error(result.error ?? "通知动作执行失败"));
}

/** 渲染端执行 main origin 直投 in-app 卡的按钮 */
export async function runInAppNotificationAction(id: string, index: number): Promise<void> {
  const entry = inAppHandlers.get(id);
  const handler = entry?.handlers?.[index];
  if (!handler) throw new Error("通知动作不存在");
  return await handler();
}

/** in-app 卡关闭：清理主进程侧登记并通知业务方收尾 */
export function closeInAppNotification(id: string) {
  const entry = inAppHandlers.get(id);
  inAppHandlers.delete(id);
  entry?.onClose?.();
}
