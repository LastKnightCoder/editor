import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@tau/plugins";
const mocks = vi.hoisted(() => ({ request: vi.fn(), on: vi.fn(), off: vi.fn() }));
vi.mock("@/commands/plugin-backend", () => ({ backendRequest: mocks.request }));
vi.mock("@/electron", () => ({ on: mocks.on, off: mocks.off }));
import { createPluginBackend } from "../backend";
import { BACKEND_SESSION_INVALID } from "@tau/plugins/backend-protocol";

function emit(channel: string, message: unknown) {
  const listener = mocks.on.mock.calls.find(([name]) => name === channel)?.[1];
  if (!listener) throw new Error(`没有注册 ${channel}`);
  listener({}, message);
}

const controllers: AbortController[] = [];
function fixture() {
  const controller = new AbortController();
  controllers.push(controller);
  const client = createPluginBackend({
    pluginId: "test.backend",
    workspaceId: "workspace",
    signal: controller.signal,
  } as PluginContext);
  return { client, controller };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockImplementation(async method => (method === "connect" ? "session" : null));
});
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.abort());
});
describe("渲染端后台连接", () => {
  it("退订 IPC 在途时重新订阅同一事件，退订完成后重新启用且仍交付事件", async () => {
    let finish!: () => void;
    let delayed = false;
    mocks.request.mockImplementation((method, _token, _event, enabled) => {
      if (method === "connect") return Promise.resolve("session");
      if (method === "subscribe" && enabled === false && !delayed) {
        delayed = true;
        return new Promise(resolve => {
          finish = () => resolve(null);
        });
      }
      return Promise.resolve(null);
    });
    const { client } = fixture();
    const first = client.subscribe("changed", vi.fn());
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("subscribe", "session", "changed", true)
    );
    const disposed = first.dispose();
    await vi.waitFor(() => expect(finish).toBeDefined());
    const listener = vi.fn();
    const second = client.subscribe("changed", listener);
    finish();
    await disposed;
    await vi.waitFor(() =>
      expect(
        mocks.request.mock.calls.filter(call => call[0] === "subscribe").map(call => call[3])
      ).toEqual([true, false, true])
    );
    emit("plugin-backend:event", { token: "session", event: "changed", value: "恢复事件" });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledExactlyOnceWith("恢复事件"));
    await second.dispose();
    expect(
      mocks.request.mock.calls.filter(call => call[0] === "subscribe").map(call => call[3])
    ).toEqual([true, false, true, false]);
  });
  it("首次未授权调用后授予权限，下一次操作重新连接且不重放失败调用", async () => {
    let allowed = false,
      count = 0;
    const sessions = new Set<string>();
    mocks.request.mockImplementation(async (method, token) => {
      if (method === "connect") {
        const value = `session-${++count}`;
        sessions.add(value);
        return value;
      }
      if (method === "disconnect") {
        sessions.delete(token);
        return;
      }
      if (!sessions.has(token)) throw new Error(`${BACKEND_SESSION_INVALID}后台连接已失效`);
      if (method === "call" && !allowed) throw new Error("后台尚未获得本机执行授权");
      return "成功";
    });
    const { client } = fixture();
    await expect(client.call("write", null)).rejects.toThrow("授权");
    sessions.clear();
    emit("plugin-backend:invalidated", { token: "session-1" });
    allowed = true;
    emit("plugin-backend:available", { pluginId: "test.backend" });
    await expect(client.call("write", null)).resolves.toBe("成功");
    expect(count).toBe(2);
    expect(mocks.request.mock.calls.filter(call => call[0] === "call")).toHaveLength(2);
  });
  it("漏掉失效通知时依据错误码丢弃令牌，写调用本身不会自动重试", async () => {
    let count = 0;
    mocks.request.mockImplementation(async method => {
      if (method === "connect") return `session-${++count}`;
      if (method === "call" && count === 1)
        throw new Error(`Error invoking remote method: ${BACKEND_SESSION_INVALID}后台连接已失效`);
      return "完成";
    });
    const { client } = fixture();
    await expect(client.call("write", null)).rejects.toThrow(BACKEND_SESSION_INVALID);
    expect(mocks.request.mock.calls.filter(call => call[0] === "call")).toHaveLength(1);
    await expect(client.call("write", null)).resolves.toBe("完成");
    expect(count).toBe(2);
  });
  it("撤权后重新授权恢复现有订阅，旧事件不交付，注销只影响新连接", async () => {
    let count = 0;
    mocks.request.mockImplementation(async method =>
      method === "connect" ? `session-${++count}` : null
    );
    const { client } = fixture();
    const listener = vi.fn();
    const subscription = client.subscribe("changed", listener);
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("subscribe", "session-1", "changed", true)
    );
    emit("plugin-backend:invalidated", { token: "session-1" });
    await Promise.resolve();
    expect(count).toBe(1);
    emit("plugin-backend:available", { pluginId: "test.backend" });
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("subscribe", "session-2", "changed", true)
    );
    emit("plugin-backend:event", { token: "session-1", event: "changed", value: "旧事件" });
    emit("plugin-backend:event", { token: "session-2", event: "changed", value: "新事件" });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledExactlyOnceWith("新事件"));
    await subscription.dispose();
    expect(mocks.request).toHaveBeenCalledWith("subscribe", "session-2", "changed", false);
  });
  it("授权变化早于旧 connect 返回时释放迟到连接，不覆盖新连接", async () => {
    let finish!: (token: string) => void,
      count = 0;
    mocks.request.mockImplementation(method =>
      method === "connect"
        ? ++count === 1
          ? new Promise(resolve => {
              finish = resolve;
            })
          : Promise.resolve("new")
        : Promise.resolve("成功")
    );
    const { client } = fixture();
    const old = client.call("write", null);
    const rejected = expect(old).rejects.toThrow("失效");
    emit("plugin-backend:available", { pluginId: "test.backend" });
    await expect(client.call("read", null)).resolves.toBe("成功");
    finish("old");
    await rejected;
    await expect(client.call("read", null)).resolves.toBe("成功");
    expect(count).toBe(2);
    expect(mocks.request).toHaveBeenCalledWith("disconnect", "old");
    expect(
      mocks.request.mock.calls.filter(call => call[0] === "call" && call[1] === "old")
    ).toHaveLength(0);
  });
  it("订阅在 connect 完成前注销，不启动后台订阅", async () => {
    let finish!: (token: string) => void;
    mocks.request.mockImplementation(method =>
      method === "connect"
        ? new Promise(resolve => {
            finish = resolve;
          })
        : Promise.resolve(null)
    );
    const { client } = fixture();
    const subscription = client.subscribe("changed", vi.fn());
    const disposed = subscription.dispose();
    finish("late");
    await disposed;
    expect(
      mocks.request.mock.calls.filter(call => call[0] === "subscribe" && call[3] === true)
    ).toHaveLength(0);
  });
  it("连接绑定插件与工作区，并发调用复用连接", async () => {
    const { client } = fixture();
    await Promise.all([client.call("one", null), client.call("two", {})]);
    expect(mocks.request.mock.calls.filter(call => call[0] === "connect")).toEqual([
      ["connect", "test.backend", "workspace"],
    ]);
    expect(
      mocks.request.mock.calls
        .filter(call => call[0] === "call")
        .every(call => call[1] === "session")
    ).toBe(true);
  });
  it("停用发生在连接完成前时回收迟到连接", async () => {
    let resolve!: (token: string) => void;
    mocks.request.mockImplementation(method =>
      method === "connect"
        ? new Promise(done => {
            resolve = done;
          })
        : Promise.resolve()
    );
    const { client, controller } = fixture();
    const pending = client.call("read", null);
    const rejected = expect(pending).rejects.toThrow();
    controller.abort();
    resolve("late");
    await rejected;
    expect(mocks.request).toHaveBeenCalledWith("disconnect", "late");
    expect(mocks.request.mock.calls.some(call => call[0] === "call")).toBe(false);
  });
  it("调用取消通知主进程，迟到结果不返回插件", async () => {
    let resolve!: (value: unknown) => void;
    mocks.request.mockImplementation(method =>
      method === "connect"
        ? Promise.resolve("session")
        : method === "call"
          ? new Promise(done => {
              resolve = done;
            })
          : Promise.resolve()
    );
    const { client } = fixture();
    const controller = new AbortController();
    const pending = client.call("read", null, { signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(resolve).toBeDefined());
    controller.abort();
    resolve("late");
    await rejected;
    expect(mocks.request.mock.calls.some(call => call[0] === "cancel")).toBe(true);
  });
});
