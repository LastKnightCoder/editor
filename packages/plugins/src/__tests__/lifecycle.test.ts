import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginInstance } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

const id = "example.lifecycle";
function deferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(create: () => PluginInstance, restartRequired = new Set<string>()) {
  const host = new PluginHost({
    workspaceId: "A",
    storage: createMemoryStorage(),
    restartRequired,
  });
  const plugin = definePlugin({ id, name: "生命周期样本", version: "1.0.0", create });
  host.registerTrusted(plugin);
  return { host, plugin, restartRequired };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("生命周期期限与异常恢复", () => {
  it("激活挂起到期退出，清除贡献；迟到激活不能复活，重新登记仍要求重启", async () => {
    const gate = deferred();
    const cleaned = vi.fn();
    let context!: PluginContext;
    const { host, plugin } = setup(() => ({
      activate(ctx) {
        context = ctx;
        ctx.commands.register({ id: "run", title: "执行", run: () => null });
        ctx.register({ dispose: cleaned });
        return gate.promise;
      },
    }));
    const enabling = expect(host.enable(id)).rejects.toThrow("激活超时");
    await vi.advanceTimersByTimeAsync(10_000);
    await enabling;
    expect(host.getState(id)).toBe("restart-required");
    expect(context.signal.aborted).toBe(true);
    expect(cleaned).toHaveBeenCalledOnce();
    expect(host.listCommands()).toEqual([]);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(host.getState(id)).toBe("restart-required");
    expect(() =>
      context.commands.register({ id: "late", title: "迟到", run: () => null })
    ).toThrow();
    await expect(context.storage.set("late", 1)).rejects.toThrow();
    await host.unregister(id);
    host.registerTrusted(plugin);
    await expect(host.enable(id)).rejects.toThrow("重启应用");
    expect(host.getState(id)).toBe("restart-required");
    await host.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("停用缩短未决激活等待，排队的再次启用被隔离；迟到拒绝被接收", async () => {
    const gate = deferred();
    const create = vi.fn(() => ({ activate: () => gate.promise }));
    const { host } = setup(create);
    const enabling = expect(host.enable(id)).rejects.toThrow("激活超时");
    await vi.advanceTimersByTimeAsync(1_000);
    const stopping = host.disable(id);
    const retry = expect(host.enable(id)).rejects.toThrow("重启应用");
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all([enabling, stopping, retry]);
    expect(create).toHaveBeenCalledOnce();
    expect(host.getState(id)).toBe("restart-required");
    gate.reject(new Error("迟到拒绝"));
    await vi.advanceTimersByTimeAsync(0);
    await host.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("停用与全部资源共享清理期限，超时后仍调用剩余资源", async () => {
    const deactivate = deferred();
    const resource = deferred();
    const calls: string[] = [];
    const { host } = setup(() => ({
      activate(ctx) {
        ctx.commands.register({ id: "run", title: "执行", run: () => null });
        ctx.register({
          dispose: () => {
            calls.push("first");
          },
        });
        ctx.register({
          dispose: () => {
            calls.push("hanging");
            return resource.promise;
          },
        });
      },
      deactivate: () => {
        calls.push("deactivate");
        return deactivate.promise;
      },
    }));
    await host.enable(id);
    const stopping = expect(host.disable(id)).rejects.toThrow("部分清理失败");
    expect(host.listCommands()).toEqual([]);
    await vi.advanceTimersByTimeAsync(4_000);
    deactivate.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await stopping;
    expect(calls).toEqual(["deactivate", "hanging", "first"]);
    expect(host.getState(id)).toBe("restart-required");
    resource.reject(new Error("迟到的资源错误"));
    await vi.advanceTimersByTimeAsync(0);
    await host.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deactivate 永不结束也不阻止资源回收和其他插件", async () => {
    const cleaned = vi.fn();
    const { host } = setup(() => ({
      activate(ctx) {
        ctx.register({ dispose: cleaned });
      },
      deactivate: () => new Promise(() => undefined),
    }));
    host.registerTrusted(
      definePlugin({
        id: "example.healthy",
        name: "正常插件",
        version: "1.0.0",
        create: () => ({
          activate(ctx) {
            ctx.commands.register({ id: "run", title: "执行", run: () => 1 });
          },
        }),
      })
    );
    await host.enable(id);
    const stopping = expect(host.disable(id)).rejects.toThrow("部分清理失败");
    await host.enable("example.healthy");
    expect(await host.executeCommand("example.healthy:run")).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await stopping;
    expect(cleaned).toHaveBeenCalledOnce();
    expect(host.getState(id)).toBe("restart-required");
    await host.dispose();
  });

  it.each(["pending", "rejected"])("提前 dispose 的 %s 结果不能从宿主清理中丢失", async mode => {
    const gate = deferred();
    const dispose = vi.fn(() => gate.promise);
    const { host } = setup(() => ({
      activate(ctx) {
        void ctx.register({ dispose }).dispose();
      },
    }));
    await host.enable(id);
    if (mode === "rejected") gate.reject();
    const stopping = expect(host.disable(id)).rejects.toThrow("部分清理失败");
    await vi.advanceTimersByTimeAsync(5_000);
    await stopping;
    expect(host.getState(id)).toBe("restart-required");
    expect(dispose).toHaveBeenCalledOnce();
    await host.dispose();
  });

  it("清理失败后共享隔离集合的新工作区拒绝启用；新运行环境可以恢复", async () => {
    const { host, plugin, restartRequired } = setup(() => ({
      activate: () => undefined,
      deactivate: () => {
        throw new Error("清理失败");
      },
    }));
    await host.enable(id);
    const closing = host.dispose();
    expect(host.dispose()).toBe(closing);
    await expect(closing).rejects.toThrow("宿主清理失败");
    const next = new PluginHost({
      workspaceId: "B",
      storage: createMemoryStorage(),
      restartRequired,
    });
    next.registerTrusted(plugin);
    expect(next.getState(id)).toBe("restart-required");
    await expect(next.enable(id)).rejects.toThrow("重启应用");
    await next.dispose();
    const fresh = new PluginHost({ workspaceId: "A", storage: createMemoryStorage() });
    fresh.registerTrusted({ ...plugin, create: () => ({ activate: () => undefined }) });
    await fresh.enable(id);
    expect(fresh.getState(id)).toBe("active");
    await fresh.dispose();
  });

  it("合作取消的激活能正常结束，再启用使用新的上下文", async () => {
    let previous!: PluginContext;
    let first = true;
    const { host } = setup(() => ({
      activate(ctx) {
        if (!first) return;
        first = false;
        previous = ctx;
        return new Promise(resolve =>
          ctx.signal.addEventListener("abort", () => resolve(), { once: true })
        );
      },
    }));
    const enabling = expect(host.enable(id)).rejects.toThrow("已停用");
    await vi.advanceTimersByTimeAsync(0);
    await host.disable(id);
    await enabling;
    expect(host.getState(id)).toBe("disabled");
    await host.enable(id);
    expect(host.getState(id)).toBe("active");
    await expect(previous.storage.set("old", true)).rejects.toThrow();
    await host.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
