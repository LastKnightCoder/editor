// @vitest-environment node
import { EventEmitter } from "node:events";
import { WebSocketServer } from "ws";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  databaseChanged: () => undefined as void,
}));
vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd(), on: vi.fn() },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      state.handlers.set(name, handler),
  },
}));
vi.mock("../database", () => ({
  default: {
    onDatabaseChange: (callback: () => void) => {
      state.databaseChanged = callback;
    },
  },
}));
vi.mock("../user-setting", () => ({ default: {} }));
import speechInput from "../speech-input";

const servers: WebSocketServer[] = [];
let ownerId = 0;
beforeAll(() => speechInput.init());
afterEach(async () => {
  state.databaseChanged();
  for (const server of servers.splice(0)) {
    server.clients.forEach(socket => socket.terminate());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
it.each(["destroyed", "render-process-gone", "did-start-navigation", "database-change"])(
  "%s 回收真实连接与麦克风租约，拒绝待读取",
  async event => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    await new Promise(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务未启动");
    const sender = Object.assign(new EventEmitter(), {
      id: ++ownerId,
      isDestroyed: () => false,
      send: vi.fn(),
    });
    const invoke = (name: string, ...args: unknown[]) =>
      state.handlers.get(name)!({ sender }, ...args);
    invoke("speech-input:claim", "lease");
    await invoke("plugin-socket:open", "socket", {
      url: `ws://127.0.0.1:${address.port}`,
      protocols: [],
      headers: {},
    });
    const pending = invoke("plugin-socket:receive", "socket");
    const rejected = expect(pending).rejects.toThrow(/取消/);
    if (event === "database-change") state.databaseChanged();
    else if (event === "did-start-navigation") sender.emit(event, {}, "about:blank", false, true);
    else sender.emit(event);
    await rejected;
    expect(() => invoke("speech-input:heartbeat", "lease")).toThrow(/已结束/);
    invoke("speech-input:claim", "next");
    invoke("speech-input:release", "next");
  }
);
