import { app, type BrowserWindow } from "electron";
import log from "electron-log";
import { ensureMacOSForegroundApplication } from "../utils/macos-activation";
import { createWindow, revealWindow } from "./create-window";

// 主窗口内容下限（CSS px）：实际 minWidth 按页面 zoomFactor 放大，
// 保证任意缩放下壳层内容不被裁（渲染端在 zoom 变化时经 refresh-window-min-size 上报）
const CONTENT_MIN_WIDTH = 1080;
const CONTENT_MIN_HEIGHT = 600;

const mainWindows = new Set<BrowserWindow>();

/** 主窗口可多开（Dock / 托盘「打开新窗口」） */
export function createMainWindow(): BrowserWindow {
  const win = createWindow({
    route: "",
    width: 1200,
    height: 800,
    minWidth: CONTENT_MIN_WIDTH,
    minHeight: CONTENT_MIN_HEIGHT,
    webPreferences: { webviewTag: true },
  });
  mainWindows.add(win);
  win.on("closed", () => mainWindows.delete(win));
  log.info(`创建主窗口，当前主窗口数量: ${mainWindows.size}`);
  return win;
}

export function getMainWindows(): BrowserWindow[] {
  return [...mainWindows].filter(win => !win.isDestroyed());
}

export function isMainWindow(win: BrowserWindow) {
  return mainWindows.has(win);
}

export function showOrCreateMainWindow() {
  ensureMacOSForegroundApplication(app);
  const [existing] = getMainWindows();
  if (existing) revealWindow(existing);
  else createMainWindow();
}

/** 最小尺寸 = 内容下限 × zoomFactor；Windows 上 setMinimumSize 不钳制当前尺寸，须手动撑到新下限 */
export function refreshMainWindowMinSize(win: BrowserWindow) {
  if (!mainWindows.has(win)) return;
  const zoom = win.webContents.getZoomFactor();
  const minWidth = Math.ceil(CONTENT_MIN_WIDTH * zoom);
  const minHeight = Math.ceil(CONTENT_MIN_HEIGHT * zoom);
  const [curWidth, curHeight] = win.getMinimumSize();
  if (curWidth === minWidth && curHeight === minHeight) return;
  win.setMinimumSize(minWidth, minHeight);
  const [width, height] = win.getSize();
  if (width < minWidth || height < minHeight) {
    win.setSize(Math.max(width, minWidth), Math.max(height, minHeight));
  }
}
