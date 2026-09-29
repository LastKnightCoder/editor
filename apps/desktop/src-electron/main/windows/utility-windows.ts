import { createWindow } from "./create-window";

/** 零散的工具窗口：快捷卡片、背景音（隐藏播放器） */

export function createQuickCardWindow() {
  return createWindow({
    route: "/quick-card?showTitlebar=true&isDefaultTop=true",
    width: 800,
    height: 600,
    alwaysOnTop: true,
  });
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
