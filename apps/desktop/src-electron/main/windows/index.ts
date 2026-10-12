import log from "electron-log";
import { configureWindowContext } from "./context";
import { registerWindowIpc } from "./ipc";
import { initNotificationWindowModule } from "./notification-window";
import { initPomodoroSingletons } from "./pomodoro-windows";
import { createBackgroundAudioWindow } from "./utility-windows";

export { createMainWindow, getMainWindows, showOrCreateMainWindow } from "./main-window";
export { openEditorWindow, closeEditorWindow } from "./editor-window";
export { openMarkdownWindow } from "./markdown-window";
export { createQuickCardWindow } from "./utility-windows";
export {
  routeNotification,
  type NotificationActionHandler,
  type NotificationOrigin,
} from "./notification-router";

/** 注册窗口 IPC，并预建常驻隐藏窗口（番茄小窗 / 沉浸、背景音）；系统通知窗口懒建 */
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
  initNotificationWindowModule();
}
