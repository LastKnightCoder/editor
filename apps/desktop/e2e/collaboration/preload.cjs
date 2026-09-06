const { contextBridge, ipcRenderer } = require("electron");
const listeners = new Map();
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args),
  on: (channel, listener) => {
    const wrapped = (_event, ...args) => listener(null, ...args);
    listeners.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
  },
  off: (channel, listener) => {
    const wrapped = listeners.get(listener);
    if (wrapped) ipcRenderer.off(channel, wrapped);
    listeners.delete(listener);
  },
});
