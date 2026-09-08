import { ipcMain } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

export type InvokeHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;
export type OnHandler = (event: IpcMainEvent, ...args: any[]) => void;

const invokeHandlers = new Map<string, InvokeHandler>();
const onHandlers = new Map<string, Set<OnHandler>>();

/**
 * 拦截 ipcMain 的 handler 注册，把所有 channel 的 handler 同步收录进 registry，
 * 供 HTTP RPC 端点分发调用（原 IPC 行为完全不变）。
 *
 * 必须在任何模块调用 ipcMain.handle 之前安装（主进程入口最早时机）。
 * 注意：所有注册都发生在各模块 init() 的运行时，入口安装即可保证时序。
 */
export function installIpcRegistry(): void {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);
  const originalRemoveHandler = ipcMain.removeHandler.bind(ipcMain);
  const originalRemoveListener = ipcMain.removeListener.bind(ipcMain);

  const patchedIpcMain = ipcMain as {
    handle: typeof ipcMain.handle;
    on: typeof ipcMain.on;
    removeHandler: typeof ipcMain.removeHandler;
    removeListener: typeof ipcMain.removeListener;
  };

  patchedIpcMain.handle = (
    channel: string,
    listener?: (event: IpcMainInvokeEvent, ...args: any[]) => unknown
  ) => {
    if (listener) {
      invokeHandlers.set(channel, listener);
    }
    // 与原生行为一致：无 listener 时由 Electron 抛错
    return originalHandle(channel, listener!);
  };

  patchedIpcMain.on = (
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void
  ) => {
    // ipcMain.on 原生支持同 channel 多 listener，以 Set 收录保持语义对等
    let listeners = onHandlers.get(channel);
    if (!listeners) {
      listeners = new Set();
      onHandlers.set(channel, listeners);
    }
    listeners.add(listener);
    return originalOn(channel, listener);
  };

  patchedIpcMain.removeListener = (
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void
  ) => {
    const listeners = onHandlers.get(channel);
    listeners?.delete(listener);
    if (listeners && !listeners.size) {
      onHandlers.delete(channel);
    }
    return originalRemoveListener(channel, listener);
  };

  patchedIpcMain.removeHandler = (channel: string) => {
    // 与原生语义一致：removeHandler 仅移除 invoke handler，不影响 on listener
    invokeHandlers.delete(channel);
    originalRemoveHandler(channel);
  };
}

export function getInvokeHandler(channel: string): InvokeHandler | undefined {
  return invokeHandlers.get(channel);
}

export function getOnHandler(channel: string): OnHandler | undefined {
  const listeners = onHandlers.get(channel);
  if (!listeners?.size) {
    return undefined;
  }
  const snapshot = [...listeners];
  // 顺序分发且不隔离异常，与 EventEmitter.emit 的原生语义一致
  return (event, ...args) => {
    for (const listener of snapshot) {
      listener(event, ...args);
    }
  };
}
