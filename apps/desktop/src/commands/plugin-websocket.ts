import {
  createBridgeWebSocket,
  type SocketIncoming,
  type SocketOpened,
} from "@tau/plugins/websocket-bridge";
import { ensureModule } from "./module-init";

export const desktopWebSocket = createBridgeWebSocket({
  async open(id, request) {
    await ensureModule("speech-input");
    return window.electron.invoke<SocketOpened>("plugin-socket:open", id, request);
  },
  send: (id, message) => window.electron.invoke("plugin-socket:send", id, message),
  receive: async id => {
    const event = await window.electron.invoke<SocketIncoming>("plugin-socket:receive", id);
    return event.type === "message" && typeof event.data !== "string"
      ? { ...event, data: new Uint8Array(event.data) }
      : event;
  },
  close: (id, code, reason) => window.electron.invoke("plugin-socket:close", id, code, reason),
  dispose: id => window.electron.invoke("plugin-socket:dispose", id),
});
