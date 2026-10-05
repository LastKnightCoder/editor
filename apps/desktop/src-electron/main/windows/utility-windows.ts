import { createWindow } from "./create-window";
import { focusExisting, registerWindow } from "./window-registry";
import { initialBounds, rememberBounds } from "./window-state";

/** 零散的工具窗口：快捷卡片、背景音（隐藏播放器） */

const QUICK_CARD_KEY = "quick-card";

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
