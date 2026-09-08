import type { RpcBootstrapInfo } from "@tau/rpc";

// 与 global.d.ts 中的 ElectronAPI 声明合并；独立成模块文件以便直接复用 @tau/rpc 类型，
// 避免手写重复结构漂移（global.d.ts 为脚本模式，无法携带顶层 import）
declare global {
  interface ElectronAPI {
    /** 一次性启动引导：返回 { token, windowId, port }，供 HTTP RPC 客户端使用 */
    bootstrap: () => Promise<RpcBootstrapInfo>;
    /** 渲染进程 console 劫持后的日志上报（fire-and-forget），由主进程写入 session 日志文件 */
    sendLog: (level: string, message: string) => void;
  }
}

export {};
