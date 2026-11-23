import log from "electron-log";
import { configureWindowContext } from "./context";
import { registerWindowIpc } from "./ipc";
import { initNotificationWindowModule } from "./notification-window";

export { createMainWindow, getMainWindows, showOrCreateMainWindow } from "./main-window";
export { openEditorWindow, closeEditorWindow } from "./editor-window";
export { openMarkdownWindow } from "./markdown-window";
export {
  createQuickCardWindow,
  findFeedbackWindow,
  showFeedbackWindow,
  hideFeedbackWindow,
} from "./utility-windows";
export {
  routeNotification,
  type NotificationActionHandler,
  type NotificationOrigin,
} from "./notification-router";

/** 注册窗口 IPC，窗口由各自的使用入口创建。 */
export function initWindows(options: {
  devServerUrl: string;
  rendererDist: string;
  preload: string;
}) {
  log.info("初始化窗口模块");
  configureWindowContext(options);
  registerWindowIpc();
  initNotificationWindowModule();
}
