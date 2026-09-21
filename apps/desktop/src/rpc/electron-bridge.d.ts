// 与 global.d.ts 中的 ElectronAPI 声明合并；独立成模块文件以便集中维护 preload 暴露的
// bridge 面类型（global.d.ts 为脚本模式，无法携带顶层 import）
declare global {
  interface ElectronAPI {
    invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, listener: (...args: unknown[]) => void) => void;
    off: (channel: string, listener: (...args: unknown[]) => void) => void;
    /** 渲染进程 console 劫持后的日志上报（fire-and-forget），由主进程写入 session 日志文件 */
    sendLog: (level: string, message: string) => void;
    /** 页面缩放系数（Ctrl±/Ctrl+滚轮等 Chromium 缩放路径） */
    getZoomFactor: () => number;
  }
}

export {};
