import { contextBridge, ipcRenderer } from "electron";

const listeners = new Map<(...args: unknown[]) => void, (...args: unknown[]) => void>();
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  windowRole: "editor",
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
    listeners.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
  },
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = listeners.get(listener);
    if (wrapped) ipcRenderer.off(channel, wrapped);
    listeners.delete(listener);
  },
});
