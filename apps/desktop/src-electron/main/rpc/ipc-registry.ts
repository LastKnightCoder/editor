import { ipcMain } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import {
  createCommandRegistry,
  type CommandEvent,
  type CommandRegistry,
  type InvokeHandler,
  type OnHandler,
} from "@tau/rpc";

const registry = createCommandRegistry();

/**
 * 拦截 ipcMain 的 handler 注册，把所有 channel 的 handler 同步收录进中立
 * registry（@tau/rpc），供 HTTP RPC 端点分发调用（原 IPC 行为完全不变）。
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
      // modules 层 handler 签名仍为 IpcMainInvokeEvent，运行时与 CommandEvent
      // 结构兼容（handler 实际只读 event.sender），此处仅类型桥接
      registry.registerInvokeHandler(channel, listener as InvokeHandler);
    }
    // 与原生行为一致：无 listener 时由 Electron 抛错
    return originalHandle(channel, listener!);
  };

  patchedIpcMain.on = (
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void
  ) => {
    registry.addOnHandler(channel, listener as OnHandler);
    return originalOn(channel, listener);
  };

  patchedIpcMain.removeListener = (
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void
  ) => {
    registry.removeOnHandler(channel, listener as OnHandler);
    return originalRemoveListener(channel, listener);
  };

  patchedIpcMain.removeHandler = (channel: string) => {
    // 与原生语义一致：removeHandler 仅移除 invoke handler，不影响 on listener
    registry.removeInvokeHandler(channel);
    originalRemoveHandler(channel);
  };
}

/** 中立 registry 实例，供 HTTP 端点等传输层装配（CommandEvent 分发） */
export function getCommandRegistry(): CommandRegistry {
  return registry;
}

export function getInvokeHandler(channel: string): InvokeHandler | undefined {
  return registry.getInvokeHandler(channel);
}

export function getOnHandler(channel: string): OnHandler | undefined {
  return registry.getOnHandler(channel);
}

/** 当前已注册的全部 invoke channel（契约对账用） */
export function listRegisteredInvokeChannels(): string[] {
  return registry.listInvokeChannels();
}

export type { CommandEvent };
