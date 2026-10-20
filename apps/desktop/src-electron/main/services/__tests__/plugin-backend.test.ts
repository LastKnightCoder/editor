// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginBackendManager, type BackendDescriptor } from "../plugin-backend/manager";

class Child extends EventEmitter {
  pid = 123;
  messages: Record<string, unknown>[] = [];
  killed = false;
  autoReady = true;
  postMessage(value: unknown) {
    const message = value as Record<string, unknown>;
    this.messages.push(message);
    if (message.type === "init" && this.autoReady)
      queueMicrotask(() => this.emit("message", { type: "ready", generation: message.generation }));
    if (message.type === "ping")
      queueMicrotask(() => this.emit("message", { type: "pong", generation: message.generation }));
    if (message.type === "stop")
      queueMicrotask(() =>
        this.emit("message", { type: "stopped", generation: message.generation })
      );
  }
  kill() {
    this.killed = true;
    return true;
  }
}
const descriptor: BackendDescriptor = {
  key: "test.backend:application",
  digest: "a".repeat(64),
  code: "code",
  cwd: "/tmp",
  workspaceId: null,
  manifest: {
    formatVersion: 2,
    apiVersion: 1,
    platform: "desktop",
    format: "cjs",
    id: "test.backend",
    name: "测试",
    version: "1.0.0",
    main: "main.js",
    integrity: { "backend.js": "b".repeat(64) },
    backend: {
      entry: "backend.js",
      runtime: "node",
      apiVersion: 1,
      scope: "application",
      activation: "on-demand",
      lifetime: "idle",
      reason: "测试",
      systemAccess: [],
    },
  },
};
const hosts: PluginBackendManager[] = [];
function fixture(authorized = true) {
  const children: Child[] = [];
  const host = new PluginBackendManager({
    spawn() {
      const child = new Child();
      children.push(child);
      return child;
    },
    authorized: async () => authorized,
    requestMs: 25,
    startupMs: 25,
  });
  hosts.push(host);
  return { host, children };
}
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.dispose()));
  vi.useRealTimers();
});

describe("插件后台管理器", () => {
  it("未授权不创建进程，并发启动只创建一个", async () => {
    const denied = fixture(false);
    await expect(denied.host.start(descriptor)).rejects.toThrow("授权");
    expect(denied.children).toHaveLength(0);
    const { host, children } = fixture();
    await Promise.all([host.start(descriptor), host.start(descriptor)]);
    expect(children).toHaveLength(1);
    expect(host.state(descriptor.key).state).toBe("running");
  });
  it("旧代次回包不能完成新请求，结果只认本次请求", async () => {
    const { host, children } = fixture();
    await host.start(descriptor);
    const pending = host.call(descriptor, "echo", { value: 1 });
    await vi.waitFor(
      () => expect(children[0].messages.some(item => item.type === "call")).toBe(true),
      { interval: 1 }
    );
    const request = children[0].messages.find(item => item.type === "call")!;
    children[0].emit("message", {
      type: "result",
      id: request.id,
      generation: "old",
      value: "wrong",
    });
    children[0].emit("message", {
      type: "result",
      id: request.id,
      generation: request.generation,
      value: "right",
    });
    await expect(pending).resolves.toBe("right");
  });
  it("无响应调用超时后终止该进程，其他实例不受影响", async () => {
    const { host, children } = fixture();
    const other = {
      ...descriptor,
      key: "other:application",
      manifest: { ...descriptor.manifest, id: "other.backend" },
    };
    await host.start(other);
    await expect(host.call(descriptor, "hang", null)).rejects.toThrow("超时");
    expect(children[1].killed).toBe(true);
    expect(host.state(descriptor.key).diagnostics).toMatchObject({
      failures: 1,
      timeouts: 1,
      startupMs: expect.any(Number),
    });
    expect(host.state(other.key).state).toBe("running");
  });
  it("停止会结束等待，迟到响应不能复活实例", async () => {
    const { host, children } = fixture();
    await host.start(descriptor);
    const pending = host.call(descriptor, "hang", null);
    const rejected = expect(pending).rejects.toThrow();
    await host.stopPlugin(descriptor.manifest.id);
    await rejected;
    children[0].emit("message", { type: "ready", generation: children[0].messages[0].generation });
    expect(host.state(descriptor.key).state).toBe("stopped");
  });
  it("授权检查期间撤销也不能在稍后启动进程", async () => {
    let authorize!: (value: boolean) => void;
    const spawn = vi.fn(() => new Child());
    const host = new PluginBackendManager({
      spawn,
      authorized: () =>
        new Promise(resolve => {
          authorize = resolve;
        }),
    });
    hosts.push(host);
    const pending = host.start(descriptor);
    const rejected = expect(pending).rejects.toThrow("撤销");
    await host.stopPlugin(descriptor.manifest.id);
    authorize(true);
    await rejected;
    expect(spawn).not.toHaveBeenCalled();
  });
});
