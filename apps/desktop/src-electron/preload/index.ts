import { contextBridge, ipcRenderer } from "electron";
// import * as process from "node:process";

contextBridge.exposeInMainWorld("electron", {
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    return ipcRenderer.on(channel, func);
  },
  off: (channel: string, func: (...args: any[]) => void) => {
    return ipcRenderer.off(channel, func);
  },
  send: (channel: string, ...args: any[]) => {
    return ipcRenderer.send(channel, ...args);
  },
  sendSync: (channel: string, ...args: any[]) => {
    return ipcRenderer.sendSync(channel, ...args);
  },
  platform: process.platform,
});
