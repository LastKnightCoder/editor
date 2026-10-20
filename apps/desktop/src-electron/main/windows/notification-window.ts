import { screen, type BrowserWindow } from "electron";
import log from "electron-log";
import type { SystemNotificationPayload } from "@tau/platform";
import { isAppQuitting } from "../app-quit-controller";
import { createWindow } from "./create-window";
import { registerWindow } from "./window-registry";

/**
 * 系统通知窗口：应用失焦时通知不进应用内卡栈，改由这个透明置顶的常驻单例承载
 * （渲染路由 /notification-host）。窗口整列贴目标屏右侧、默认点击穿透，
 * 由渲染端在卡片可交互区域 hover 时经 IPC 临时关闭穿透。
 */

export const NOTIFICATION_WINDOW_KEY = "notification:system";

const NOTIFICATION_WIDTH = 400;

let win: BrowserWindow | null = null;
/** 渲染端 ready 前到达的通知排队，ready 后冲 flush（避免首帧丢卡） */
let pending: SystemNotificationPayload[] = [];
let rendererReady = false;

const current = () => (win && !win.isDestroyed() ? win : null);

/** 整列贴右：宽固定，高与位置贴合目标屏工作区；originWin 用于定位用户所在显示器 */
function placeWindow(target: BrowserWindow, originWin?: BrowserWindow | null) {
  const workArea = originWin
    ? screen.getDisplayMatching(originWin.getBounds()).workArea
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  target.setBounds({
    width: NOTIFICATION_WIDTH,
    height: workArea.height,
    x: workArea.x + workArea.width - NOTIFICATION_WIDTH,
    y: workArea.y,
  });
}

function ensureWindow(): BrowserWindow {
  const existing = current();
  if (existing) return existing;
  log.info("创建系统通知窗口（隐藏状态）");
  win = createWindow({
    route: "/notification-host",
    chrome: "none",
    role: "notification",
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    show: false,
  });
  win.setAlwaysOnTop(true, "pop-up-menu");
  // 默认整窗穿透但保留 forward：渲染端靠 mousemove 感知卡片位置来切换交互态
  win.setIgnoreMouseEvents(true, { forward: true });
  registerWindow(NOTIFICATION_WINDOW_KEY, win);
  win.on("close", event => {
    if (isAppQuitting()) return;
    event.preventDefault();
    win?.hide();
  });
  win.on("closed", () => {
    win = null;
    rendererReady = false;
    // 窗口崩溃重建后旧卡片已不可恢复，未冲 flush 的排队通知一并放弃
    pending = [];
  });
  return win;
}

/** 推入一条系统通知；窗口隐藏时先按来源窗口重算几何再 showInactive（绝不抢焦点） */
export function pushSystemNotification(
  payload: SystemNotificationPayload,
  originWin?: BrowserWindow | null
) {
  const target = ensureWindow();
  if (!rendererReady) {
    pending.push(payload);
    return;
  }
  target.webContents.send("notification-window:push", payload);
  if (!target.isVisible()) {
    placeWindow(target, originWin);
    target.showInactive();
  }
}

/** 渲染端（/notification-host）就绪：冲 flush 排队通知并显示窗口 */
export function markNotificationWindowReady() {
  rendererReady = true;
  const target = current();
  if (!target || pending.length === 0) return;
  for (const payload of pending) target.webContents.send("notification-window:push", payload);
  pending = [];
  if (!target.isVisible()) {
    placeWindow(target);
    target.showInactive();
  }
}

/** 切换整窗点击穿透：true = 卡片可交互，false = 恢复穿透 + forward */
export function setNotificationWindowInteractive(interactive: boolean) {
  const target = current();
  if (!target) return;
  if (interactive) target.setIgnoreMouseEvents(false);
  else target.setIgnoreMouseEvents(true, { forward: true });
}

/** 栈已清空：隐藏窗口并恢复穿透 */
export function emptyNotificationWindow() {
  const target = current();
  if (!target) return;
  target.hide();
  target.setIgnoreMouseEvents(true, { forward: true });
}

/** 让系统窗口关闭某条（或全部）通知卡；窗口不存在时 no-op */
export function dismissSystemNotification(id?: string) {
  pending = id === undefined ? [] : pending.filter(payload => payload.id !== id);
  current()?.webContents.send("notification-window:dismiss", id);
}

/** 订阅显示器分辨率/排布变化：可见时重新贴右对齐（须在 app ready 后调用一次） */
export function initNotificationWindowModule() {
  screen.on("display-metrics-changed", () => {
    const target = current();
    if (target?.isVisible()) placeWindow(target);
  });
}
