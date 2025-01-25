import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, func);
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  },
  sendSync: (channel: string, ...args: any[]) => {
    ipcRenderer.sendSync(channel, ...args);
  }
});

