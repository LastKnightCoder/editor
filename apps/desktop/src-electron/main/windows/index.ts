import log from "electron-log";
import { configureWindowContext } from "./context";
import { registerWindowIpc } from "./ipc";
import { initPomodoroSingletons } from "./pomodoro-windows";
import { createBackgroundAudioWindow } from "./utility-windows";

export { createMainWindow, getMainWindows, showOrCreateMainWindow } from "./main-window";
export { openEditorWindow, closeEditorWindow } from "./editor-window";
export { openMarkdownWindow } from "./markdown-window";
export { createPomodoroWindow } from "./pomodoro-windows";
export { createTodoWindow, createQuickCardWindow } from "./utility-windows";

/** 注册窗口 IPC，并预建常驻隐藏窗口（番茄小窗 / 沉浸、背景音） */
export function initWindows(options: {
  devServerUrl: string;
  rendererDist: string;
  preload: string;
}) {
  log.info("初始化窗口模块");
  configureWindowContext(options);
  registerWindowIpc();
  initPomodoroSingletons();
  createBackgroundAudioWindow();
}
