import { screen, type BrowserWindow } from "electron";
import log from "electron-log";
import { isAppQuitting } from "../app-quit-controller";
import { createWindow, revealWindow } from "./create-window";

/**
 * 番茄钟窗口：
 * - 专注页：普通窗口，可多开
 * - 小窗 / 沉浸：常驻单例，启动时隐藏创建，关闭即隐藏复用（退出时才真正销毁）
 */

export function createPomodoroWindow() {
  return createWindow({ route: "/pomodoro", width: 800, height: 600 });
}

/** 隐藏复用的单例：被销毁（崩溃 / 意外关闭）时下次 show 重建 */
function singleton(name: string, create: () => BrowserWindow) {
  let win: BrowserWindow | null = null;
  const ensure = () => {
    if (win && !win.isDestroyed()) return win;
    log.info(`创建${name}（隐藏状态）`);
    win = create();
    win.on("close", event => {
      if (isAppQuitting()) return;
      event.preventDefault();
      win?.hide();
    });
    win.on("closed", () => (win = null));
    return win;
  };
  return {
    ensure,
    current: () => (win && !win.isDestroyed() ? win : null),
  };
}

const mini = singleton("番茄小窗", () =>
  createWindow({
    route: "/pomodoro/mini",
    chrome: "none",
    devTools: false,
    width: 360,
    height: 84,
    resizable: false,
    alwaysOnTop: true,
    show: false,
  })
);

const isMac = process.platform === "darwin";

const immersive = singleton("番茄沉浸窗口", () => {
  // macOS 用铺满屏幕的普通窗口 + simpleFullScreen（显示时再开，避免隐藏期间 Dock 仍被隐藏）
  const { width, height } = screen.getPrimaryDisplay().size;
  return createWindow({
    route: "/pomodoro/immersive",
    chrome: "none",
    devTools: false,
    alwaysOnTop: true,
    // 沉浸页纯黑底：首帧与页面切换不闪白
    backgroundColor: "#000000",
    show: false,
    fullscreen: !isMac,
    enableLargerThanScreen: isMac,
    ...(isMac && { width, height, x: 0, y: 0 }),
  });
});

export function initPomodoroSingletons() {
  mini.ensure();
  immersive.ensure();
}

export function showPomodoroMiniWindow() {
  revealWindow(mini.ensure());
}

export function hidePomodoroMiniWindow() {
  mini.current()?.hide();
}

export function showPomodoroImmersiveWindow() {
  const win = immersive.ensure();
  if (isMac) win.setSimpleFullScreen(true);
  else win.setFullScreen(true);
  revealWindow(win);
}

export function hidePomodoroImmersiveWindow() {
  const win = immersive.current();
  if (!win) return;
  if (isMac) win.setSimpleFullScreen(false);
  else win.setFullScreen(false);
  win.hide();
}
