import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // 一次性启动引导：返回 { token, windowId, port }，供 HTTP RPC 客户端使用
  bootstrap: () => {
    return ipcRenderer.invoke("rpc-bootstrap");
  },
  // 渲染进程 console 劫持后的日志上报：直连 IPC，无 HTTP RPC 的启动竞态
  sendLog: (level: string, message: string) => {
    ipcRenderer.send("logger:renderer-log", { level, message });
  },
  platform: process.platform,
});
