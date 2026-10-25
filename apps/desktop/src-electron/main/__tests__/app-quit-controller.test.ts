// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginBackendManager, type BackendDescriptor } from "../services/plugin-backend/manager";

const state = vi.hoisted(() => ({
  updater: null as any,
  nativeUpdater: null as any,
  showError: vi.fn(),
  events: new Map<string, (...args: any[]) => void>(),
  handlers: new Map<string, (...args: any[]) => void>(),
  windows: [] as any[],
  host: null as PluginBackendManager | null,
  order: [] as string[],
  exit: vi.fn(),
  disposeContent: vi.fn(),
  durable: vi.fn(async () => ({ commit() {}, rollback() {} })),
}));
vi.mock("../modules/durable-document-lifecycle", () => ({
  prepareDurableDocuments: state.durable,
}));
vi.mock("electron", () => ({
  autoUpdater: { on: (...args: any[]) => state.nativeUpdater.on(...args) },
  dialog: { showErrorBox: state.showError },
  app: {
    isPackaged: true,
    getVersion: () => "0.60.0",
    once: (name: string, handler: (...args: any[]) => void) => state.events.set(name, handler),
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
  default: { shutdown: vi.fn() },
}));
vi.mock("../modules/mcp", () => ({ default: { disconnectAll: async () => undefined } }));
vi.mock("../windows/create-window", () => ({
  isContentRuntimeWindow: (window: { internal?: boolean }) => !!window.internal,
}));
vi.mock("../services/content-execution", () => ({
  contentExecutor: { dispose: state.disposeContent },
}));

vi.mock("electron-updater", () => ({
  default: {
    get autoUpdater() {
      return state.updater;
    },
  },
}));
vi.mock("fs-extra/esm", () => ({ default: { readJson: async () => ({ lastVersion: "0.60.0" }) } }));
vi.mock("../utils/PathUtil", () => ({ default: { getAppDir: () => "/tmp/tau-updater-test" } }));

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
  let destroyed = false;
  const events = new EventEmitter();
  return Object.assign(events, {
    id: 1,
    webContents: { send: vi.fn(), isDestroyed: () => destroyed },
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true;
      events.emit("closed");
    }),
  });
}
beforeEach(async () => {
  vi.resetModules();
  state.events.clear();
  state.handlers.clear();
  state.windows = [];
  state.order = [];
  state.updater = Object.assign(new EventEmitter(), {
    quitAndInstall: vi.fn(),
    downloadUpdate: vi.fn(async () => []),
    checkForUpdates: vi.fn(),
  });
  state.nativeUpdater = new EventEmitter();
  state.showError.mockReset();
  state.exit.mockReset();
  state.disposeContent.mockReset();
  state.durable.mockReset().mockResolvedValue({ commit() {}, rollback() {} });
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

async function initUpdater() {
  setup({ getTrayManager: () => undefined });
  await (await import("../modules/updater")).default.init();
}

function updateReady() {
  state.updater.emit("update-downloaded", { version: "0.61.0" });
  state.nativeUpdater.emit("update-downloaded");
}

it.each(["darwin", "win32", "linux"])("%s 只在平台更新器确认就绪后显示安装入口", async platform => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: platform });
  try {
    const win = window();
    state.windows = [win];
    await initUpdater();
    await expect(state.handlers.get("updater:install")!()).rejects.toThrow("尚未准备完成");
    state.updater.emit("update-downloaded", { version: "0.61.0" });
    if (platform === "darwin") {
      expect(win.webContents.send).not.toHaveBeenCalled();
      await expect(state.handlers.get("updater:install")!()).rejects.toThrow("尚未准备完成");
      state.nativeUpdater.emit("update-downloaded");
      state.nativeUpdater.emit("update-downloaded");
    }
    expect(win.webContents.send).toHaveBeenCalledExactlyOnceWith("updater:update-downloaded", {
      version: "0.61.0",
    });
    expect(state.durable).not.toHaveBeenCalled();
    await state.handlers.get("updater:download")!();
    await expect(state.handlers.get("updater:install")!()).rejects.toThrow("尚未准备完成");
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
});

it("原生验包失败后，迟到的就绪事件不能重新开放安装", async () => {
  const win = window();
  state.windows = [win];
  await initUpdater();
  state.updater.emit("update-downloaded", { version: "0.61.0" });
  state.updater.emit("error", new Error("签名校验失败"));
  win.webContents.send.mockClear();
  state.nativeUpdater.emit("update-downloaded");
  expect(win.webContents.send).not.toHaveBeenCalled();
  await expect(state.handlers.get("updater:install")!()).rejects.toThrow("尚未准备完成");
  expect(state.durable).not.toHaveBeenCalled();
});

it("下载 Promise 拒绝但没有 error 事件时仍释放下载状态，允许重试", async () => {
  await initUpdater();
  state.updater.downloadUpdate.mockRejectedValueOnce(new Error("下载断开"));
  await expect(state.handlers.get("updater:download")!()).rejects.toThrow("下载断开");
  await expect(state.handlers.get("updater:download")!()).resolves.toEqual({ started: true });
  expect(state.updater.downloadUpdate).toHaveBeenCalledTimes(2);
});

it("窗口销毁回调抛错也继续销毁其他窗口并交接更新", async () => {
  vi.useFakeTimers();
  const racing = window(),
    live = window();
  live.id = 2;
  racing.destroy.mockImplementation(() => {
    throw new Error("销毁回调失败");
  });
  state.windows = [racing, live];
  await initUpdater();
  updateReady();
  for (const win of state.windows)
    win.webContents.send.mockImplementation(() =>
      state.handlers.get("app:quitting-ready")!({ sender: win.webContents })
    );
  await state.handlers.get("updater:install")!();
  expect(live.destroy).toHaveBeenCalledOnce();
  expect(state.updater.quitAndInstall).toHaveBeenCalledOnce();
});

it("立即更新先保存并收尾隐藏窗口，安装器的 before-quit 不会再次被控制器拦住", async () => {
  vi.useFakeTimers();
  const win = window();
  state.windows = [win];
  let saved!: (value: { commit(): void; rollback(): void }) => void;
  state.durable.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        saved = resolve;
      })
  );
  win.webContents.send.mockImplementation(() =>
    state.handlers.get("app:quitting-ready")!({ sender: win.webContents })
  );
  await initUpdater();
  updateReady();
  win.webContents.send.mockClear();
  const nativePrevent = vi.fn();
  state.updater.quitAndInstall.mockImplementation(() => {
    expect(win.isDestroyed()).toBe(true);
    expect(state.host!.beginDrain).toHaveBeenCalledOnce();
    state.events.get("before-quit")!({ preventDefault: nativePrevent });
    state.events.get("quit")!();
  });
  const installing = state.handlers.get("updater:install")!();
  await state.handlers.get("updater:install")!();
  await vi.advanceTimersByTimeAsync(20000);
  expect(win.destroy).not.toHaveBeenCalled();
  expect(state.exit).not.toHaveBeenCalled();
  expect(state.updater.quitAndInstall).not.toHaveBeenCalled();
  saved({ commit() {}, rollback() {} });
  await installing;
  expect(win.destroy).toHaveBeenCalledOnce();
  expect(state.updater.quitAndInstall).toHaveBeenCalledOnce();
  expect(nativePrevent).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(20000);
  expect(state.exit).not.toHaveBeenCalled();
});

it("保存失败不启动安装或销毁窗口，重试可继续安装", async () => {
  vi.useFakeTimers();
  const win = window();
  state.windows = [win];
  await initUpdater();
  updateReady();
  state.durable.mockRejectedValueOnce(new Error("正文未确认保存"));
  await expect(state.handlers.get("updater:install")!()).rejects.toThrow("正文未确认保存");
  await vi.advanceTimersByTimeAsync(30000);
  expect(win.destroy).not.toHaveBeenCalled();
  expect(state.exit).not.toHaveBeenCalled();
  expect(state.updater.quitAndInstall).not.toHaveBeenCalled();
  win.webContents.send.mockImplementation(() =>
    state.handlers.get("app:quitting-ready")!({ sender: win.webContents })
  );
  await state.handlers.get("updater:install")!();
  expect(state.updater.quitAndInstall).toHaveBeenCalledOnce();
});

it("窗口已销毁或发送时被销毁，不影响其余窗口收尾与安装", async () => {
  const dead = window(),
    racing = window(),
    live = window();
  dead.id = 1;
  racing.id = 2;
  live.id = 3;
  dead.webContents.isDestroyed = () => true;
  racing.webContents.send.mockImplementation(() => {
    throw new Error("Object has been destroyed");
  });
  live.webContents.send.mockImplementation(() =>
    state.handlers.get("app:quitting-ready")!({ sender: live.webContents })
  );
  state.windows = [dead, racing, live];
  await initUpdater();
  updateReady();
  live.webContents.send.mockClear();
  state.updater.quitAndInstall.mockImplementation(() => state.events.get("quit")!());
  await state.handlers.get("updater:install")!();
  expect(dead.webContents.send).not.toHaveBeenCalled();
  expect(live.webContents.send).toHaveBeenCalledWith("app:quitting");
  expect(state.updater.quitAndInstall).toHaveBeenCalledOnce();
});

it("收尾超时仍交接一次更新，迟到完成不会再次安装；安装器不退出时有最终兜底", async () => {
  vi.useFakeTimers();
  let complete!: () => void;
  vi.spyOn(state.host!, "dispose").mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  await initUpdater();
  updateReady();
  const installing = state.handlers.get("updater:install")!();
  await vi.advanceTimersByTimeAsync(15000);
  expect(state.updater.quitAndInstall).toHaveBeenCalledOnce();
  expect(state.exit).not.toHaveBeenCalled();
  complete();
  await installing;
  expect(state.updater.quitAndInstall).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15000);
  expect(state.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it.each(["throw", "event"])("安装器以 %s 报错时显示原生错误并结束已收尾的旧进程", async mode => {
  vi.useFakeTimers();
  await initUpdater();
  updateReady();
  state.updater.quitAndInstall.mockImplementation(() => {
    if (mode === "event") state.updater.emit("error", new Error("安装器拒绝"));
    else throw new Error("安装器拒绝");
  });
  await state.handlers.get("updater:install")!();
  expect(state.showError).toHaveBeenCalledWith(
    "更新安装失败",
    expect.stringContaining("安装器拒绝")
  );
  expect(state.exit).toHaveBeenCalledExactlyOnceWith(1);
  await vi.advanceTimersByTimeAsync(30000);
  expect(state.exit).toHaveBeenCalledOnce();
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
    expect(state.order).toEqual(["rpc", "drain", "pause"]);
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

it.each(["白板投影失败", "正文未确认保存"])(
  "%s 时取消退出并保留窗口，重试成功后才能退出",
  async message => {
    vi.useFakeTimers();
    const win = window();
    state.windows = [win];
    state.durable.mockRejectedValueOnce(new Error(message));
    setup({ getTrayManager: () => undefined });
    state.events.get("before-quit")!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(20000);
    expect(state.exit).not.toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(state.host!.beginDrain).not.toHaveBeenCalled();
    win.webContents.send.mockImplementation(() =>
      state.handlers.get("app:quitting-ready")!({ sender: win.webContents })
    );
    state.events.get("before-quit")!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.exit).toHaveBeenCalledWith(0);
    expect(state.durable).toHaveBeenCalledTimes(2);
  }
);

it("保存屏障未完成时再次退出仍阻止 Electron 默认关窗", async () => {
  vi.useFakeTimers();
  let reject!: (reason: Error) => void;
  state.durable.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  setup({ getTrayManager: () => undefined });
  const first = vi.fn(),
    second = vi.fn();
  state.events.get("before-quit")!({ preventDefault: first });
  state.events.get("before-quit")!({ preventDefault: second });
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(state.durable).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(20000);
  expect(state.exit).not.toHaveBeenCalled();
  reject(new Error("仍有未保存草稿"));
  await vi.advanceTimersByTimeAsync(0);
});

it("窗口收尾没有回执时保留有限等待，后续收尾挂起仍在全程期限强制清理", async () => {
  vi.useFakeTimers();
  await state.host!.start(descriptor);
  const win = window();
  state.windows = [win];
  vi.spyOn(state.host!, "dispose").mockImplementationOnce(() => new Promise(() => undefined));
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
