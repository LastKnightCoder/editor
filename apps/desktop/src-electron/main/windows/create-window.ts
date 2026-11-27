import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type WebContents,
} from "electron";
import log from "electron-log";
import { isDev, loadRoute, loadContentRuntime, windowContext } from "./context";
import { registerPomodoroAudioHost } from "./pomodoro-audio";
import { routeWindowOpen } from "./open-handler";
import { shouldKeepBackgroundAlive } from "../services/background-preferences";
import { recordPerf, registerPerfWindow } from "../modules/perf-record";

/**
 * 标题栏形态：
 * - custom：去原生边框，渲染端自绘标题栏；macOS 原生信号灯移出屏幕，由渲染端自绘
 * - native：系统标题栏
 * - none：无边框无标题栏（小窗 / 沉浸 / 隐藏窗口）
 */
export type WindowChrome = "custom" | "native" | "none";
const contentRuntimeWindows = new Set<BrowserWindow>();
export const isContentRuntimeWindow = (window: BrowserWindow) => contentRuntimeWindows.has(window);
// 主进程主动结束的渲染进程（如内容执行超时后回收）不按崩溃记录
const expectedRendererExit = new WeakSet<WebContents>();
export const expectRendererExit = (contents: WebContents) => {
  expectedRendererExit.add(contents);
};

export interface CreateWindowOptions extends BrowserWindowConstructorOptions {
  document?: "content-runtime" | "plugin-window" | "auxiliary";
  /** hash 路由（如 "/editor-window?..."）；空串 = 应用根 */
  route: string;
  chrome?: WindowChrome;
  /** 开发模式下是否自动打开 DevTools（隐藏窗口须关掉，否则 DevTools 会把窗口带出来） */
  devTools?: boolean;
  /** 窗口角色（渲染端经 process.argv 识别）：主窗口 = main，预热/常驻任务只在主窗口跑 */
  role?: "main" | "markdown" | "editor" | "utility" | "notification" | "plugin-window";
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

/** 非 macOS 的最后一个可见窗口关闭即退出，已授权后台保活除外。 */
export function quitIfNoVisibleWindow() {
  if (process.platform === "darwin") return;
  if (shouldKeepBackgroundAlive()) return;
  const visible = BrowserWindow.getAllWindows().some(win => !win.isDestroyed() && win.isVisible());
  if (!visible) {
    log.info("没有可见窗口，退出应用");
    app.quit();
  }
}

/** 唯一的 BrowserWindow 构造入口：统一基础配置、事件转发、加载与错误日志 */
export function createWindow({
  document,
  route,
  chrome = "custom",
  devTools = true,
  role,
  webPreferences,
  ...options
}: CreateWindowOptions): BrowserWindow {
  const { preload, icon } = windowContext();
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    icon,
    ...chromeOptions(chrome),
    ...options,
    webPreferences: {
      preload,
      spellcheck: false,
      // additionalArguments 会拼进渲染进程 argv：preload / 渲染端据此识别窗口角色
      ...(role ? { additionalArguments: [`--tau-window-role=${role}`] } : {}),
      ...webPreferences,
    },
  });

  // 日志里的窗口身份：隐藏与辅助窗口没有可辨识的标题
  const logSource = `${document ?? role ?? "window"}:${route || "/"}`;
  const contents = win.webContents;
  const perfRole = document ?? role ?? "window";
  win.once("closed", registerPerfWindow(contents.id, perfRole));
  contents.on("render-process-gone", (_event, details) => {
    if (!expectedRendererExit.has(contents))
      log.error("[window] 渲染进程已退出", { window: logSource, ...details });
  });
  contents.on("preload-error", (_event, preloadPath, error) => {
    log.error("[window] preload 加载失败", { window: logSource, preloadPath }, error);
  });
  win.on("unresponsive", () => {
    log.warn("[window] 窗口无响应", { window: logSource });
    recordPerf(
      { t: Date.now(), kind: "unresponsive" },
      {
        pid: contents.getOSProcessId(),
        type: "renderer",
        windowId: win.id,
        webContentsId: contents.id,
        role: perfRole,
      }
    );
  });
  win.on("responsive", () => log.info("[window] 窗口恢复响应", { window: logSource }));

  forwardWindowEvents(win);
  if (role === "main" || document === "auxiliary") registerPomodoroAudioHost(win.webContents);
  if (document === "auxiliary") {
    pendingReveal.set(win, undefined);
    win.webContents.ipc.once("auxiliary:ready", () => {
      const show = pendingReveal.get(win);
      pendingReveal.delete(win);
      show?.();
    });
    win.webContents.once("render-process-gone", () => {
      if (!win.isDestroyed()) win.destroy();
    });
  }
  if (document === "content-runtime") {
    contentRuntimeWindows.add(win);
    win.once("closed", () => contentRuntimeWindows.delete(win));
  }
  win.webContents.setWindowOpenHandler(routeWindowOpen);
  if (document !== "content-runtime") win.on("closed", quitIfNoVisibleWindow);
  win.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (document === "auxiliary" && isMainFrame && code !== -3 && !win.isDestroyed()) win.destroy();
    log.error(`窗口加载失败: ${code} - ${description}, URL: ${url}`);
  });

  if (document === "content-runtime") loadContentRuntime(win);
  else if (document === "auxiliary") loadRoute(win, route, "auxiliary.html");
  else if (document !== "plugin-window") loadRoute(win, route);
  if (isDev() && devTools) win.webContents.openDevTools();
  return win;
}

/**
 * macOS 把应用切到前台：win.focus() 只在没有别的应用处于激活态时生效，
 * 从不可聚焦的系统通知窗口、托盘等入口唤起时必须抢占激活。
 */
export function activateApp() {
  if (process.platform === "darwin") app.focus({ steal: true });
}

// 冷启动等到交互内容提交；其间的连续打开和隐藏只保留最后一次意图。
const pendingReveal = new WeakMap<BrowserWindow, (() => void) | undefined>();

export function hideAuxiliaryWindow(win: BrowserWindow) {
  if (pendingReveal.has(win)) pendingReveal.set(win, undefined);
  win.hide();
}

/** 恢复、显示并聚焦（macOS 同时把应用切到前台） */
export function revealWindow(win: BrowserWindow, beforeShow?: () => void) {
  if (pendingReveal.has(win)) {
    pendingReveal.set(win, () => revealWindow(win, beforeShow));
    return;
  }
  beforeShow?.();
  activateApp();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
