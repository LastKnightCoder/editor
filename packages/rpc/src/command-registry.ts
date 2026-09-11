import type { CommandEvent } from "./command";

/**
 * 中立命令注册表：channel → handler 的收录与查询，零 Electron 依赖。
 *
 * Electron 侧由 ipc-registry 的 monkey-patch 写入，Web Server 侧由宿主
 * 自行调用 register* 写入；HTTP 端点（http-command-endpoint）与未来的
 * 其他传输层都从这里分发。
 */

export type InvokeHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  event: CommandEvent,
  ...args: TArgs
) => TResult | Promise<TResult>;
export type OnHandler<TArgs extends unknown[] = unknown[]> = (
  event: CommandEvent,
  ...args: TArgs
) => void;

export interface CommandRegistry {
  registerInvokeHandler(channel: string, handler: InvokeHandler): void;
  removeInvokeHandler(channel: string): void;
  addOnHandler(channel: string, listener: OnHandler): void;
  removeOnHandler(channel: string, listener: OnHandler): void;
  getInvokeHandler(channel: string): InvokeHandler | undefined;
  /** 同 channel 多 listener 聚合为单个分发器（顺序分发、不隔离异常，对齐 EventEmitter 语义） */
  getOnHandler(channel: string): OnHandler | undefined;
  listInvokeChannels(): string[];
  listOnChannels(): string[];
}

export function createCommandRegistry(): CommandRegistry {
  const invokeHandlers = new Map<string, InvokeHandler>();
  const onHandlers = new Map<string, Set<OnHandler>>();

  return {
    registerInvokeHandler(channel, handler) {
      invokeHandlers.set(channel, handler);
    },
    removeInvokeHandler(channel) {
      invokeHandlers.delete(channel);
    },
    addOnHandler(channel, listener) {
      let listeners = onHandlers.get(channel);
      if (!listeners) {
        listeners = new Set();
        onHandlers.set(channel, listeners);
      }
      listeners.add(listener);
    },
    removeOnHandler(channel, listener) {
      const listeners = onHandlers.get(channel);
      listeners?.delete(listener);
      if (listeners && !listeners.size) {
        onHandlers.delete(channel);
      }
    },
    getInvokeHandler(channel) {
      return invokeHandlers.get(channel);
    },
    getOnHandler(channel) {
      const listeners = onHandlers.get(channel);
      if (!listeners?.size) {
        return undefined;
      }
      const snapshot = [...listeners];
      return (event, ...args) => {
        for (const listener of snapshot) {
          listener(event, ...args);
        }
      };
    },
    listInvokeChannels() {
      return [...invokeHandlers.keys()];
    },
    listOnChannels() {
      return [...onHandlers.keys()];
    },
  };
}
