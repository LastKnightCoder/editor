import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { EditorWindowTarget } from "@tau/platform";
import { closeEditorWindow, openEditorWindow } from "./editor-window";
import { refreshMainWindowMinSize, showOrCreateMainWindow } from "./main-window";
import { openMarkdownWindow } from "./markdown-window";
import {
  hidePomodoroImmersiveWindow,
  hidePomodoroMiniWindow,
  showPomodoroImmersiveWindow,
  showPomodoroMiniWindow,
} from "./pomodoro-windows";

/** 窗口相关 IPC 的唯一注册处；通道名与 @tau/platform 的 Electron 实现一一对应 */

const senderWindow = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender);

export function registerWindowIpc() {
  // 作用于发起调用的窗口
  ipcMain.handle("close-window", event => senderWindow(event)?.close());
  ipcMain.handle("minimize-window", event => senderWindow(event)?.minimize());
  ipcMain.handle("maximize-window", event => {
    const win = senderWindow(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle("toggle-fullscreen", event => {
    const win = senderWindow(event);
    win?.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle("set-always-on-top", (event, flag: boolean) =>
    senderWindow(event)?.setAlwaysOnTop(flag)
  );
  ipcMain.handle("get-window-state", event => {
    const win = senderWindow(event);
    return { isMaximized: win?.isMaximized() ?? false, isFullScreen: win?.isFullScreen() ?? false };
  });
  ipcMain.handle("get-full-screen-status", event => senderWindow(event)?.fullScreen ?? false);
  ipcMain.handle("refresh-window-min-size", event => {
    const win = senderWindow(event);
    if (win) refreshMainWindowMinSize(win);
  });

  // 打开 / 切换其它窗口
  ipcMain.handle("show-and-focus-window", () => showOrCreateMainWindow());
  ipcMain.handle("open-editor-window", (_event, target: EditorWindowTarget) =>
    openEditorWindow(target)
  );
  ipcMain.handle("close-editor-window", (_event, target: EditorWindowTarget) =>
    closeEditorWindow(target)
  );
  ipcMain.handle("open-markdown-window", (_event, path?: string) => openMarkdownWindow(path));
  ipcMain.handle("open-pomodoro-mini-window", () => showPomodoroMiniWindow());
  ipcMain.handle("hide-pomodoro-mini-window", () => hidePomodoroMiniWindow());
  ipcMain.handle("open-pomodoro-immersive-window", () => showPomodoroImmersiveWindow());
  ipcMain.handle("hide-pomodoro-immersive-window", () => hidePomodoroImmersiveWindow());
}
