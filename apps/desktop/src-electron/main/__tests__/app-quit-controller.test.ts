// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginBackendManager, type BackendDescriptor } from "../services/plugin-backend/manager";

const state = vi.hoisted(() => ({
  events: new Map<string, (...args: any[]) => void>(),
  handlers: new Map<string, (...args: any[]) => void>(),
  windows: [] as any[],
  host: null as PluginBackendManager | null,
  order: [] as string[],
  exit: vi.fn(),
  flush: vi.fn(async () => undefined),
  disposeContent: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    on: (name: string, handler: (...args: any[]) => void) => state.events.set(name, handler),
    exit: state.exit,
  },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => void) => state.handlers.set(name, handler),
  },
  BrowserWindow: {
    getAllWindows: () => state.windows,
    fromWebContents: (sender: unknown) =>
      state.windows.find(window => window.webContents === sender),
  },
  globalShortcut: { unregisterAll: vi.fn() },
}));
vi.mock("electron-log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../modules/plugin-backend", () => ({
  get pluginBackends() {
    return state.host!;
  },
  setPluginBackendsPaused: async () => {
    state.order.push("pause");
  },
}));
vi.mock("../modules/collaboration", () => ({
  default: { prepareQuit: state.flush, shutdown: vi.fn() },
}));
vi.mock("../modules/mcp", () => ({ default: { disconnectAll: async () => undefined } }));
vi.mock("../windows/create-window", () => ({
  isContentRuntimeWindow: (window: { internal?: boolean }) => !!window.internal,
}));
vi.mock("../services/content-execution", () => ({
  contentExecutor: { dispose: state.disposeContent },
}));

class Child extends EventEmitter {
  pid = 123;
  kill = vi.fn(() => true);
  postMessage(message: { type: string; generation: string; id?: string }) {
    queueMicrotask(() => {
      if (message.type === "init")
        this.emit("message", { type: "ready", generation: message.generation });
      if (message.type === "ping")
        this.emit("message", { type: "pong", generation: message.generation });
      if (message.type === "stop")
        this.emit("message", { type: "stopped", generation: message.generation });
      if (message.type === "call") {
        state.order.push("rpc");
        this.emit("message", {
          type: "result",
          generation: message.generation,
          id: message.id,
          value: "退出同步完成",
        });
      }
    });
  }
}
const descriptor: BackendDescriptor = {
  key: "test.quit:application",
  digest: "a".repeat(64),
  code: "",
  cwd: "/tmp",
  workspaceId: null,
  manifest: {
    id: "test.quit",
    name: "退出同步",
    version: "1.0.0",
    apiVersion: 1,
    formatVersion: 2,
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    integrity: { "backend.js": "b".repeat(64) },
    backend: {
      entry: "backend.js",
      runtime: "node",
      apiVersion: 1,
      scope: "application",
      activation: "on-demand",
      lifetime: "idle",
      reason: "退出时同步",
      systemAccess: [],
    },
  },
};
let child: Child;
let setup: typeof import("../app-quit-controller").setupQuitController;
function window() {
  return Object.assign(new EventEmitter(), {
    id: 1,
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
    destroy: vi.fn(),
  });
}
beforeEach(async () => {
  vi.resetModules();
  state.events.clear();
  state.handlers.clear();
  state.windows = [];
  state.order = [];
  state.exit.mockReset();
  state.disposeContent.mockReset();
  state.flush.mockReset().mockImplementation(async () => {
    state.order.push("flush");
  });
  child = new Child();
  state.host = new PluginBackendManager({ authorized: async () => true, spawn: () => child });
  const drain = state.host.beginDrain.bind(state.host);
  vi.spyOn(state.host, "beginDrain").mockImplementation(() => {
    state.order.push("drain");
    drain();
  });
  setup = (await import("../app-quit-controller")).setupQuitController;
});
afterEach(async () => {
  await state.host!.dispose();
  vi.useRealTimers();
});

it.each([false, true])(
  "退出同步仍能调用真实后台管理器（预先运行=%s），回执后才关闭入口",
  async started => {
    if (started) await state.host!.start(descriptor);
    const win = window();
    const internal = { ...window(), id: 2, internal: true };
    state.windows = [win, internal];
    let result: unknown, failure: unknown;
    win.webContents.send.mockImplementation(() => {
      void state
        .host!.call(descriptor, "sync.upload", null)
        .then(value => {
          result = value;
          state.handlers.get("app:quitting-ready")!({ sender: win.webContents });
        })
        .catch(error => {
          failure = error;
        });
    });
    setup({ getTrayManager: () => undefined });
    state.events.get("before-quit")!({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(state.exit).toHaveBeenCalledWith(0));
    expect(failure).toBeUndefined();
    expect(result).toBe("退出同步完成");
    expect(state.order).toEqual(["rpc", "drain", "pause", "flush"]);
    expect(internal.webContents.send).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalled();
    await expect(state.host!.call(descriptor, "sync.upload", null)).rejects.toThrow("正在退出");
  }
);

it("同步回执在广播回调内到达时也立即继续退出，不等待窗口超时", async () => {
  const win = window();
  state.windows = [win];
  win.webContents.send.mockImplementation(() =>
    state.handlers.get("app:quitting-ready")!({ sender: win.webContents })
  );
  setup({ getTrayManager: () => undefined });
  state.events.get("before-quit")!({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(state.exit).toHaveBeenCalledWith(0));
});

it("窗口收尾没有回执时保留有限等待，后续收尾挂起仍在全程期限强制清理", async () => {
  vi.useFakeTimers();
  await state.host!.start(descriptor);
  const win = window();
  state.windows = [win];
  state.flush.mockImplementation(() => new Promise(() => undefined));
  setup({ getTrayManager: () => undefined });
  state.events.get("before-quit")!({ preventDefault: vi.fn() });
  await vi.advanceTimersByTimeAsync(7999);
  expect(state.host!.beginDrain).not.toHaveBeenCalled();
  await expect(state.host!.call(descriptor, "sync.upload", null)).resolves.toBe("退出同步完成");
  await vi.advanceTimersByTimeAsync(1);
  expect(state.host!.beginDrain).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(7000);
  expect(state.exit).toHaveBeenCalledWith(0);
  expect(state.disposeContent).toHaveBeenCalled();
  expect(child.kill).toHaveBeenCalled();
});
