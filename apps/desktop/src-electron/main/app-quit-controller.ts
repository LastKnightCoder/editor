import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import log from "electron-log";
import type { WindowManager } from "./modules/window-manager";
import collaborationModule from "./modules/collaboration";
import mcpModule from "./modules/mcp";
import whiteboardRecordingModule from "./modules/whiteboard-recording";

// 主进程广播该事件后，渲染进程完成收尾（自动同步等）并通过 app:quitting-ready 回执
const QUITTING_CHANNEL = "app:quitting";
const READY_CHANNEL = "app:quitting-ready";
// 单窗口等待渲染进程收尾的最长时间，超时后继续退出（尽力保存）
const WINDOW_READY_TIMEOUT_MS = 8000;
// 受控退出全程的最长时间，超时强制退出，避免"点了退出没反应"
const FORCE_EXIT_TIMEOUT_MS = 15000;

let quitting = false;
const windowReadyResolvers = new Map<number, () => void>();

export function isAppQuitting(): boolean {
  return quitting;
}

interface QuitControllerDeps {
  getWindowManager: () => WindowManager | undefined;
  getTrayManager: () => { destroyTray: () => void } | undefined;
}

/**
 * 受控退出：接管 before-quit，避免 Electron 自动关窗被 close 拦截器
 * （协作文档 flush、自动同步 beforeunload）中止后应用残留（macOS 需退出两次）。
 */
export function setupQuitController(deps: QuitControllerDeps): void {
  ipcMain.handle(READY_CHANNEL, event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) windowReadyResolvers.get(window.id)?.();
  });

  app.on("before-quit", event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void runControlledQuit(deps);
  });
}

async function runControlledQuit(deps: QuitControllerDeps): Promise<void> {
  const forceExitTimer = setTimeout(() => {
    log.warn("受控退出超时，强制退出应用");
    app.exit(0);
  }, FORCE_EXIT_TIMEOUT_MS);

  try {
    const windows = BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
    log.info(`受控退出开始，等待 ${windows.length} 个窗口收尾`);
    for (const win of windows) win.webContents.send(QUITTING_CHANNEL);
    await Promise.all(windows.map(win => waitForWindowReady(win)));

    // 协作文档落盘必须在断开连接、销毁窗口之前
    await collaborationModule.prepareQuit();

    globalShortcut.unregisterAll();
    deps.getWindowManager()?.destroySingletonWindows();
    deps.getTrayManager()?.destroyTray();
    whiteboardRecordingModule.destroyControlWindow();

    // destroy 绕过 beforeunload 与窗口 close 拦截器，退出流程不会被再次中止
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.destroy();
    }

    await mcpModule.disconnectAll();
    collaborationModule.shutdown();
  } catch (error) {
    log.error("受控退出流程出错:", error);
  } finally {
    clearTimeout(forceExitTimer);
    app.exit(0);
  }
}

function waitForWindowReady(win: BrowserWindow): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      win.removeListener("closed", finish);
      windowReadyResolvers.delete(win.id);
      resolve();
    };
    const timer = setTimeout(finish, WINDOW_READY_TIMEOUT_MS);
    win.once("closed", finish);
    windowReadyResolvers.set(win.id, finish);
  });
}
