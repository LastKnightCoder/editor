import { httpInvoke, httpSend } from "@/rpc/http-invoke";
import rpcEventHub from "@/rpc/event-hub";

const bridge = window.electron;

export const platform: string = bridge?.platform ?? "web";
/** 是否运行在 Electron 环境；Web 端据此隐藏窗口概念相关的 UI 入口 */
export const isElectron: boolean = platform !== "web";

// 请求-响应式 command 全部走 HTTP RPC（baseUrl 见 src/rpc/config.ts，
// 切换 VITE_RPC_BASE_URL 即可指向未来 Web Server）
export const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
  return httpInvoke<T>(channel, args);
};

export const send = (channel: string, ...args: unknown[]): void => {
  void httpSend(channel, args);
};

// 主进程事件推送经 /rpc-events WebSocket 通道广播，本地按 channel 分发。
// 分发时以占位 event 补齐 IPC 契约的 (event, ...args) 签名
export const on = <Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void
): void => {
  rpcEventHub.on(channel, listener);
};

export const off = <Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void
): void => {
  rpcEventHub.off(channel, listener);
};
