import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

contextBridge.exposeInMainWorld("electron", {
  invoke: (channel: string, ...args: unknown[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.off(channel, listener);
  },
  send: (channel: string, ...args: unknown[]) => {
    return ipcRenderer.send(channel, ...args);
  },
  // 页面缩放系数（Ctrl±/Ctrl+滚轮等 Chromium 缩放路径）：渲染端据此判断 zoom 是否变化
  getZoomFactor: () => webFrame.getZoomFactor(),
  // 渲染进程 console 劫持后的日志上报（fire-and-forget），由主进程写入 session 日志文件
  sendLog: (level: string, message: string) => {
    ipcRenderer.send("logger:renderer-log", { level, message });
  },
  // 拖入文件的本机路径（Electron 32 起 File.path 已移除，只能在 preload 经 webUtils 取）
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  platform: process.platform,
  windowRole: process.argv.find(arg => arg.startsWith("--tau-window-role="))?.split("=")[1],
});
