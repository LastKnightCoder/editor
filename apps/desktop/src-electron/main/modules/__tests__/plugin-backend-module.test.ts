// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { PluginPermissionStore } from "../../services/plugin-permissions";

const state = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: any[]) => any>(),
  quits: [] as (() => void)[],
  store: null as PluginPermissionStore | null,
  spawn: vi.fn(),
  focused: true,
}));
vi.mock("electron", () => ({
  app: {
    getPath: () => state.root,
    getVersion: () => "0.59.0",
    once: (_name: string, callback: () => void) => state.quits.push(callback),
    getLoginItemSettings: () => ({ openAtLogin: false }),
  },
  BrowserWindow: { fromWebContents: () => ({ id: 1, isFocused: () => state.focused }) },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => state.handlers.set(name, handler),
  },
  utilityProcess: { fork: state.spawn },
}));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => state.root } }));
vi.mock("../database", () => ({
  default: {
    windowToDatabase: new Map([[1, "main"]]),
    getDatabase: () => ({}),
    getCurrentDatabase: () => null,
    getCurrentDatabaseName: () => "main",
    onDatabaseConnected: () => () => undefined,
  },
}));
vi.mock("../../services/plugin-workspaces", () => ({
  getPluginRegistry: () => ({ open: async () => ({ id: "workspace" }) }),
}));
vi.mock("../plugin-permissions", () => ({ getPluginPermissionStore: () => state.store! }));
vi.mock("../../services/plugin-backend/terminate", () => ({
  terminateBackendChild: (child: { kill(): void }) => child.kill(),
}));

class Child extends EventEmitter {
  pid = 999;
  postMessage(message: { type: string; generation: string }) {
    if (message.type === "init" || message.type === "stop" || message.type === "ping")
      queueMicrotask(() =>
        this.emit("message", {
          type: { init: "ready", stop: "stopped", ping: "pong" }[message.type],
          generation: message.generation,
        })
      );
  }
  kill() {
    return true;
  }
}
let backend: typeof import("../plugin-backend");
let event: any;
const request = (method: string, ...args: unknown[]) =>
  state.handlers.get("plugin-backend:" + method)!(event, ...args);
beforeEach(async () => {
  vi.resetModules();
  state.handlers.clear();
  state.quits = [];
  state.spawn.mockReset();
  state.focused = true;
  state.root = await mkdtemp(path.join(tmpdir(), "tau-backend-module-"));
  state.store = new PluginPermissionStore(path.join(state.root, "permissions.json"));
  state.spawn.mockImplementation(() => new Child());
  const directory = path.join(state.root, "plugins/example.backend");
  await mkdir(directory, { recursive: true });
  const code = "throw new Error('静态读取不得执行')";
  await writeFile(path.join(directory, "main.js"), code);
  await writeFile(path.join(directory, "backend.js"), code);
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      id: "example.backend",
      name: "后台",
      version: "1.0.0",
      minAppVersion: "0.59.0",
      apiVersion: 1,
      formatVersion: 2,
      platform: "desktop",
      format: "cjs",
      main: "main.js",
      backend: {
        entry: "backend.js",
        runtime: "node",
        apiVersion: 1,
        scope: "application",
        activation: "app-ready",
        lifetime: "persistent",
        reason: "测试",
        systemAccess: [],
      },
      integrity: {
        "main.js": createHash("sha256").update(code).digest("hex"),
        "backend.js": createHash("sha256").update(code).digest("hex"),
      },
    })
  );
  await writeFile(
    path.join(state.root, "plugins/.enabled.json"),
    JSON.stringify({ version: 1, browserImported: true, enabled: { "example.backend": true } })
  );
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
  });
  event = { sender, senderFrame: sender.mainFrame };
  backend = await import("../plugin-backend");
  await backend.default.init();
});
afterEach(async () => {
  await backend.setPluginBackendsPaused(true);
  await backend.pluginBackends.dispose();
  state.quits.forEach(callback => callback());
  await rm(state.root, { recursive: true, force: true });
});

it("自动启动没有授权时不执行，前台授予后启动，暂停后阻止拉起", async () => {
  await backend.activatePluginBackends();
  expect(state.spawn).not.toHaveBeenCalled();
  const snapshot = await request("snapshot", "example.backend");
  expect(snapshot.status.state).toBe("blocked");
  await request("grant", "example.backend", snapshot.digest, "always");
  expect(state.spawn).toHaveBeenCalledTimes(1);
  await backend.setPluginBackendsPaused(true);
  await backend.activatePluginBackends();
  expect(state.spawn).toHaveBeenCalledTimes(1);
  await backend.setPluginBackendsPaused(false);
  expect(state.spawn).toHaveBeenCalledTimes(2);
  await request("grant", "example.backend", snapshot.digest, null);
  await backend.activatePluginBackends();
  expect(state.spawn).toHaveBeenCalledTimes(2);
});

it("旧版本摘要和后台窗口不能提交授权，临时授权在停用后失效", async () => {
  const snapshot = await request("snapshot", "example.backend");
  await expect(request("grant", "example.backend", "old", "always")).rejects.toThrow("版本");
  state.focused = false;
  await expect(request("grant", "example.backend", snapshot.digest, "always")).rejects.toThrow(
    "前台"
  );
  state.focused = true;
  await request("grant", "example.backend", snapshot.digest, "once");
  await backend.stopPluginBackend("example.backend");
  expect(await state.store!.backendGranted("example.backend", "application", snapshot.digest)).toBe(
    false
  );
});

it("连接绑定工作区和窗口，断开后拒绝旧令牌", async () => {
  await expect(request("connect", "example.backend", "other")).rejects.toThrow("工作区");
  const token = await request("connect", "example.backend", "workspace");
  await request("disconnect", token);
  expect(() => request("state", token)).toThrow("失效");
});

it("首次授权通知已有客户端丢弃令牌并恢复订阅，撤权不发送可用通知", async () => {
  const token = await request("connect", "example.backend", "workspace");
  const snapshot = await request("snapshot", "example.backend");
  event.sender.send.mockClear();
  await request("grant", "example.backend", snapshot.digest, "always");
  expect(event.sender.send).toHaveBeenCalledWith("plugin-backend:invalidated", { token });
  expect(event.sender.send).toHaveBeenCalledWith("plugin-backend:available", {
    pluginId: "example.backend",
  });
  expect(() => request("state", token)).toThrow("PLUGIN_BACKEND_SESSION_INVALID:");
  const next = await request("connect", "example.backend", "workspace");
  event.sender.send.mockClear();
  await request("grant", "example.backend", snapshot.digest, null);
  expect(event.sender.send).toHaveBeenCalledWith("plugin-backend:invalidated", { token: next });
  expect(
    event.sender.send.mock.calls.some(([name]: [string]) => name === "plugin-backend:available")
  ).toBe(false);
});

it("MCP 外部程序必须声明并授权，撤权立即取消连接租约", async () => {
  const transport = { command: "node", args: ["server.js"] };
  await expect(backend.authorizePluginMcp(event, "example.backend", transport)).rejects.toThrow(
    "声明"
  );
  const file = path.join(state.root, "plugins/example.backend/manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.backend.systemAccess = ["process"];
  manifest.backend.tools = [{ id: "mcp", command: "node", args: ["server.js"] }];
  await writeFile(file, JSON.stringify(manifest));
  await expect(backend.authorizePluginMcp(event, "example.backend", transport)).rejects.toThrow(
    "授权"
  );
  const snapshot = await request("snapshot", "example.backend");
  await request("grant", "example.backend", snapshot.digest, "always");
  const lease = await backend.authorizePluginMcp(event, "example.backend", transport);
  let closed = false;
  lease.onClose(async () => {
    await Promise.resolve();
    closed = true;
  });
  await expect(
    backend.protectPluginBackendChange("example.backend", async () => true)
  ).rejects.toThrow("任务或订阅");
  expect(lease.parameters.command).not.toBe("node");
  await expect(
    backend.authorizePluginMcp(event, "example.backend", { ...transport, args: ["other.js"] })
  ).rejects.toThrow("声明");
  await request("grant", "example.backend", snapshot.digest, null);
  expect(lease.signal.aborted).toBe(true);
  expect(closed).toBe(true);
  await expect(lease.validate()).rejects.toThrow();
});

it("更新临界区阻止后台再次启动，切换结束后才放行", async () => {
  const snapshot = await request("snapshot", "example.backend");
  await request("grant", "example.backend", snapshot.digest, "always");
  const source = await backend
    .authorizePluginMcp(event, "example.backend", { command: "node" })
    .catch(() => null);
  expect(source).toBeNull();
  await backend.protectPluginBackendChange("example.backend", async () => {
    await backend.stopPluginBackend("example.backend");
    await expect(request("restart", "example.backend")).rejects.toThrow("授权");
  });
  await request("restart", "example.backend");
  expect(state.spawn).toHaveBeenCalledTimes(2);
});
