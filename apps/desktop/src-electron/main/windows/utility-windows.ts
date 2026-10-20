import { screen, type BrowserWindow } from "electron";
import { isAppQuitting } from "../app-quit-controller";
import { createWindow, quitIfNoVisibleWindow, revealWindow } from "./create-window";
import { findWindow, focusExisting, registerWindow } from "./window-registry";
import { hasRememberedBounds, initialBounds, rememberBounds } from "./window-state";

/** 零散的工具窗口：快捷卡片、反馈、背景音（隐藏播放器） */

const QUICK_CARD_KEY = "quick-card";
const FEEDBACK_KEY = "feedback";
const FEEDBACK_SIZE = { width: 440, height: 640 };

/** 快捷卡片窗口：打开即新建一张卡片；单例，再次唤起聚焦已有窗口（不重复建卡） */
export function createQuickCardWindow() {
  if (focusExisting(QUICK_CARD_KEY)) return;
  const win = createWindow({
    route: "/quick-card",
    // 尺寸同卡片编辑窗口
    ...initialBounds(QUICK_CARD_KEY, { width: 560, height: 680 }, []),
    minWidth: 480,
    minHeight: 400,
    alwaysOnTop: true,
  });
  registerWindow(QUICK_CARD_KEY, win);
  rememberBounds(QUICK_CARD_KEY, win);
}

export const findFeedbackWindow = () => findWindow(FEEDBACK_KEY);

/** 首次打开贴在发起窗口右侧内缘，避免整块挡住正在复现问题的区域中央 */
function besideAnchor(anchor: BrowserWindow) {
  const box = anchor.getBounds();
  const area = screen.getDisplayMatching(box).workArea;
  const { width, height } = FEEDBACK_SIZE;
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(box.x + box.width - width - 24, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(box.y + 56, area.y + area.height - height)),
  };
}

/** 反馈窗口预热：隐藏加载，关闭请求交由渲染端确认，退出时才销毁 */
export function prepareFeedbackWindow(): BrowserWindow {
  const existing = findFeedbackWindow();
  if (existing) return existing;
  const win = createWindow({
    route: "/feedback",
    role: "utility",
    ...initialBounds(FEEDBACK_KEY, FEEDBACK_SIZE, []),
    minWidth: 400,
    minHeight: 520,
    alwaysOnTop: true,
    show: false,
    devTools: false,
  });
  registerWindow(FEEDBACK_KEY, win);
  win.on("close", event => {
    if (isAppQuitting()) return;
    event.preventDefault();
    win.webContents.send("app-feedback:close-requested");
  });
  win.once("show", () => rememberBounds(FEEDBACK_KEY, win, "hide"));
  return win;
}

/** 首次显示时才确定锚点位置，后续直接唤起同一窗口 */
export function showFeedbackWindow(anchor: BrowserWindow | null): BrowserWindow {
  const win = prepareFeedbackWindow();
  if (anchor && !anchor.isDestroyed() && !hasRememberedBounds(FEEDBACK_KEY) && !win.isVisible())
    win.setBounds(besideAnchor(anchor));
  revealWindow(win);
  return win;
}

export function hideFeedbackWindow() {
  const win = findFeedbackWindow();
  if (!win || !win.isVisible()) return;
  win.hide();
  quitIfNoVisibleWindow();
}

/** 背景音播放窗口：常驻隐藏，不进任务栏；被关闭（崩溃）时由调用方按需重建 */
export function createBackgroundAudioWindow() {
  return createWindow({
    route: "/background-audio",
    chrome: "native",
    devTools: false,
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
  });
}
