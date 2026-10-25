import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import log from "electron-log";
import collaborationModule from "./modules/collaboration";
import mcpModule from "./modules/mcp";
import { pluginBackends, setPluginBackendsPaused } from "./modules/plugin-backend";
import { isContentRuntimeWindow } from "./windows/create-window";
import { contentExecutor } from "./services/content-execution";

// 主进程广播该事件后，渲染进程完成收尾（自动同步等）并通过 app:quitting-ready 回执
const QUITTING_CHANNEL = "app:quitting";
const READY_CHANNEL = "app:quitting-ready";
// 单窗口等待渲染进程收尾的最长时间，超时后继续退出（尽力保存）
const WINDOW_READY_TIMEOUT_MS = 8000;
// 文档确认保存后，收尾和安装交接各自的等待上限
const FORCE_EXIT_TIMEOUT_MS = 15000;

let quitting = false;
let nativeQuitAllowed = false;
let quitTask: Promise<void> | undefined;
let controllerDeps: QuitControllerDeps | undefined;
const windowReadyResolvers = new Map<number, () => void>();

export function isAppQuitting(): boolean {
  return quitting;
}

interface QuitControllerDeps {
  getTrayManager: () => { destroyTray: () => void } | undefined;
}

/**
 * 受控退出：接管 before-quit，避免 Electron 自动关窗被 close 拦截器
 * （协作文档 flush、自动同步 beforeunload）中止后应用残留（macOS 需退出两次）。
 */
export function setupQuitController(deps: QuitControllerDeps): void {
  controllerDeps = deps;
  ipcMain.handle(READY_CHANNEL, event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) windowReadyResolvers.get(window.id)?.();
  });

  app.on("before-quit", event => {
    if (nativeQuitAllowed) return;
    event.preventDefault();
    void requestAppQuit().catch(() => undefined);
  });
}

/** 更新安装也从保存屏障进入，不能让安装器先关闭业务窗口。 */
export function requestAppQuit(installUpdate?: () => void): Promise<void> {
  if (quitTask) return quitTask;
  if (!controllerDeps) return Promise.reject(new Error("退出控制器尚未初始化"));
  quitting = true;
  log.info(installUpdate ? "请求更新退出，等待文档确认保存" : "请求退出，等待文档确认保存");
  quitTask = runControlledQuit(controllerDeps, installUpdate).finally(() => {
    if (!quitting) quitTask = undefined;
  });
  return quitTask;
}

async function runControlledQuit(
  deps: QuitControllerDeps,
  installUpdate?: () => void
): Promise<void> {
  try {
    await collaborationModule.prepareQuit();
  } catch (error) {
    quitting = false;
    log.error("文档尚未确认保存，保留窗口并取消退出:", error);
    throw error;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(forceExitTimer);
    pluginBackends.forceDispose();
    contentExecutor.dispose();
    // destroy 绕过隐藏窗口和 beforeunload 的关闭拦截。
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch (error) {
        log.warn("退出时销毁窗口失败:", error);
      }
    }
    if (!installUpdate) {
      app.exit(0);
      return;
    }
    nativeQuitAllowed = true;
    const installExitTimer = setTimeout(() => {
      log.warn("更新安装已交接，原生退出超时，结束旧进程");
      app.exit(0);
    }, FORCE_EXIT_TIMEOUT_MS);
    installExitTimer.unref?.();
    app.once("quit", () => clearTimeout(installExitTimer));
    try {
      log.info("受控退出收尾完成，交接更新安装器");
      installUpdate();
    } catch (error) {
      clearTimeout(installExitTimer);
      log.error("更新安装器启动失败:", error);
      app.exit(1);
    }
  };
  const forceExitTimer = setTimeout(() => {
    log.warn("退出收尾超时，执行最终退出动作");
    finish();
  }, FORCE_EXIT_TIMEOUT_MS);

  try {
    const windows = BrowserWindow.getAllWindows().filter(
      win => !win.isDestroyed() && !win.webContents.isDestroyed() && !isContentRuntimeWindow(win)
    );
    log.info(`受控退出开始，等待 ${windows.length} 个窗口收尾`);
    const ready = windows.map(win => waitForWindowReady(win));
    for (const win of windows) {
      try {
        if (win.isDestroyed() || win.webContents.isDestroyed()) {
          windowReadyResolvers.get(win.id)?.();
          continue;
        }
        win.webContents.send(QUITTING_CHANNEL);
      } catch (error) {
        log.warn("窗口退出通知失败:", error);
        windowReadyResolvers.get(win.id)?.();
      }
    }
    await Promise.all(ready);

    pluginBackends.beginDrain();
    await setPluginBackendsPaused(true);
    await pluginBackends.dispose();

    contentExecutor.dispose();

    globalShortcut.unregisterAll();
    deps.getTrayManager()?.destroyTray();

    await mcpModule.disconnectAll();
    collaborationModule.shutdown();
  } catch (error) {
    log.error("受控退出流程出错:", error);
  } finally {
    finish();
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
