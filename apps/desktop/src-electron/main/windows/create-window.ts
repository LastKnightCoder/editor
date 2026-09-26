import { app, BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import log from "electron-log";
import { isDev, loadRoute, windowContext } from "./context";

/**
 * 标题栏形态：
 * - custom：去原生边框，渲染端自绘标题栏；macOS 原生信号灯移出屏幕，由渲染端自绘
 * - native：系统标题栏
 * - none：无边框无标题栏（小窗 / 沉浸 / 隐藏窗口）
 */
export type WindowChrome = "custom" | "native" | "none";

export interface CreateWindowOptions extends BrowserWindowConstructorOptions {
  /** hash 路由（如 "/editor-window?..."）；空串 = 应用根 */
  route: string;
  chrome?: WindowChrome;
  /** 开发模式下是否自动打开 DevTools（隐藏窗口须关掉，否则 DevTools 会把窗口带出来） */
  devTools?: boolean;
}

function chromeOptions(chrome: WindowChrome): BrowserWindowConstructorOptions {
  if (chrome === "native") return { frame: true };
  if (chrome === "none") return { frame: false };
  return process.platform === "darwin"
    ? { frame: false, titleBarStyle: "hidden", trafficLightPosition: { x: -1000, y: -1000 } }
    : { frame: false };
}

/** 窗口状态变化推给渲染端（标题栏最大化按钮、全屏隐藏信号灯、焦点态） */
function forwardWindowEvents(win: BrowserWindow) {
  const send = (channel: string) => () => {
    if (!win.isDestroyed()) win.webContents.send(channel);
  };
  win.on("enter-full-screen", send("full-screen-change"));
  win.on("leave-full-screen", send("full-screen-change"));
  win.on("maximize", send("window-maximized"));
  win.on("unmaximize", send("window-unmaximized"));
  win.on("focus", send("window-focus"));
  win.on("blur", send("window-blur"));
}

/** Windows 下最后一个可见窗口关闭即退出（隐藏的常驻窗口不算）；macOS 保持 Dock 常驻语义 */
function quitIfNoVisibleWindow() {
  if (process.platform !== "win32") return;
  const visible = BrowserWindow.getAllWindows().some(win => !win.isDestroyed() && win.isVisible());
  if (!visible) {
    log.info("没有可见窗口，退出应用");
    app.quit();
  }
}

/** 唯一的 BrowserWindow 构造入口：统一基础配置、事件转发、加载与错误日志 */
export function createWindow({
  route,
  chrome = "custom",
  devTools = true,
  webPreferences,
  ...options
}: CreateWindowOptions): BrowserWindow {
  const { preload, icon } = windowContext();
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    icon,
    ...chromeOptions(chrome),
    ...options,
    webPreferences: { preload, spellcheck: false, ...webPreferences },
  });

  forwardWindowEvents(win);
  win.on("closed", quitIfNoVisibleWindow);
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    log.error(`窗口加载失败: ${code} - ${description}, URL: ${url}`);
  });

  loadRoute(win, route);
  if (isDev() && devTools) win.webContents.openDevTools();
  return win;
}

/** 恢复、显示并聚焦 */
export function revealWindow(win: BrowserWindow) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
