import { contextBridge, ipcRenderer } from "electron";
import {
  communicationEvents,
  pluginWindowMethods,
  windowChannel,
  type PluginWindowCalls,
  type WindowCommunicationEvents,
} from "../../shared/plugin-window-protocol";

export function exposePluginWindow() {
  contextBridge.exposeInMainWorld("tauPluginWindow", {
    invoke(method: keyof PluginWindowCalls, input: unknown) {
      if (!pluginWindowMethods.includes(method)) throw new Error("不支持的插件窗口调用");
      return ipcRenderer.invoke(windowChannel(method), input);
    },
    on(event: keyof WindowCommunicationEvents, listener: (payload: unknown) => void) {
      if (!communicationEvents.includes(event)) throw new Error("不支持的插件窗口事件");
      const channel = windowChannel(event);
      const receive = (_event: unknown, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, receive);
      return () => ipcRenderer.removeListener(channel, receive);
    },
  });
}
