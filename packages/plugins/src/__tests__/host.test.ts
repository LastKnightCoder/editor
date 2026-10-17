import { describe, expect, it } from "vitest";
import { definePlugin, type PluginContext, type PluginInstance } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

const definition = (create: () => PluginInstance, id = "example.notes") =>
  definePlugin({ id, name: "示例", version: "1.0.0", create });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("受信任插件 API", () => {
  it("注册、重复启用、执行、停用和重新启用形成完整生命周期", async () => {
    const calls: string[] = [];
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    host.registerTrusted(
      definition(() => {
        calls.push("create");
        return {
          activate(ctx) {
            calls.push("activate");
            ctx.commands.register({ id: "echo", title: "回声", run: value => value });
            ctx.register({
              dispose: () => {
                calls.push("first");
              },
            });
            ctx.register({
              dispose: () => {
                calls.push("second");
              },
            });
          },
          deactivate() {
            calls.push("deactivate");
          },
        };
      })
    );
    expect(host.listCommands()).toEqual([]);
    await Promise.all([host.enable("example.notes"), host.enable("example.notes")]);
    expect(calls).toEqual(["create", "activate"]);
    expect(await host.executeCommand("example.notes:echo", { text: "你好" })).toEqual({
      text: "你好",
    });
    await host.disable("example.notes");
    expect(host.listCommands()).toEqual([]);
    expect(calls.slice(2)).toEqual(["deactivate", "second", "first"]);
    await expect(host.executeCommand("example.notes:echo")).rejects.toThrow("命令不可用");
    await host.enable("example.notes");
    expect(calls.filter(call => call === "create")).toHaveLength(2);
    await host.dispose();
    await host.dispose();
  });

  it("激活失败撤销部分注册，修复后可再次启用", async () => {
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    let fail = true;
    let cleaned = 0;
    host.registerTrusted(
      definition(() => ({
        activate(ctx) {
          ctx.commands.register({ id: "echo", title: "回声", run: value => value });
          ctx.register({
            dispose: () => {
              cleaned++;
            },
          });
          if (fail) throw new Error("激活失败");
        },
      }))
    );
    await expect(host.enable("example.notes")).rejects.toThrow("激活失败");
    expect(host.getState("example.notes")).toBe("failed");
    expect(host.listCommands()).toEqual([]);
    expect(cleaned).toBe(1);
    fail = false;
    await host.enable("example.notes");
    expect(host.listCommands()).toHaveLength(1);
    await host.dispose();
  });

  it("一个清理函数抛错不阻止其余清理或注销", async () => {
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    let cleaned = false;
    host.registerTrusted(
      definition(() => ({
        activate(ctx) {
          ctx.commands.register({ id: "echo", title: "回声", run: value => value });
          ctx.register({
            dispose: () => {
              cleaned = true;
            },
          });
          ctx.register({
            dispose: () => {
              throw new Error("清理失败");
            },
          });
        },
        deactivate() {
          throw new Error("退出失败");
        },
      }))
    );
    await host.enable("example.notes");
    await expect(host.unregister("example.notes")).rejects.toThrow(AggregateError);
    expect(cleaned).toBe(true);
    expect(host.listCommands()).toEqual([]);
    expect(() => host.getState("example.notes")).toThrow("插件未注册");
  });

  it("停用中的在途命令不能用旧上下文写入或交付结果", async () => {
    const gate = deferred();
    const started = deferred();
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    let context!: PluginContext;
    host.registerTrusted(
      definition(() => ({
        activate(ctx) {
          context = ctx;
          ctx.commands.register({
            id: "late",
            title: "延迟",
            async run() {
              started.resolve();
              await gate.promise;
              return "迟到结果";
            },
          });
        },
      }))
    );
    await host.enable("example.notes");
    const pending = host.executeCommand("example.notes:late");
    const rejected = expect(pending).rejects.toThrow("实例已失效");
    await started.promise;
    await host.disable("example.notes");
    expect(context.signal.aborted).toBe(true);
    await expect(context.storage.set("late", "不应写入")).rejects.toThrow();
    gate.resolve();
    await rejected;
    await host.dispose();
  });

  it("激活期间停用会取消该代次，不能留下贡献", async () => {
    const started = deferred();
    const gate = deferred();
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    host.registerTrusted(
      definition(() => ({
        async activate(ctx) {
          ctx.commands.register({ id: "echo", title: "回声", run: value => value });
          started.resolve();
          await gate.promise;
        },
      }))
    );
    const enabling = host.enable("example.notes");
    const rejected = expect(enabling).rejects.toThrow("已停用");
    await started.promise;
    const disabling = host.disable("example.notes");
    gate.resolve();
    await rejected;
    await disabling;
    expect(host.getState("example.notes")).toBe("disabled");
    expect(host.listCommands()).toEqual([]);
    await host.dispose();
  });

  it("注销与启用并发时不会创建悬空实例", async () => {
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    host.registerTrusted(definition(() => ({ activate: () => undefined })));
    await host.enable("example.notes");
    const removing = host.unregister("example.notes");
    const enabling = host.enable("example.notes");
    await expect(enabling).rejects.toThrow("正在注销");
    await removing;
    expect(() => host.getState("example.notes")).toThrow("插件未注册");
  });

  it("存储按插件及工作区隔离，读取和写入都是副本", async () => {
    const storage = createMemoryStorage();
    const first = new PluginHost({ workspaceId: "A", storage });
    const second = new PluginHost({ workspaceId: "B", storage });
    const contexts = new Map<string, PluginContext>();
    const contextOf = (key: string) => {
      const context = contexts.get(key);
      if (!context) throw new Error(`测试上下文不存在：${key}`);
      return context;
    };
    const plugin = (id: string) =>
      definition(
        () => ({
          activate(ctx) {
            contexts.set(`${ctx.workspaceId}:${ctx.pluginId}`, ctx);
          },
        }),
        id
      );
    first.registerTrusted(plugin("one"));
    first.registerTrusted(plugin("two"));
    second.registerTrusted(plugin("one"));
    await Promise.all([first.enable("one"), first.enable("two"), second.enable("one")]);
    const own = contextOf("A:one");
    const value = { title: "原值" };
    await own.storage.set("config", value);
    value.title = "被修改";
    expect(await own.storage.get("config")).toEqual({ title: "原值" });
    expect(await contextOf("A:two").storage.get("config")).toBeUndefined();
    expect(await contextOf("B:one").storage.get("config")).toBeUndefined();
    await first.unregister("one");
    first.registerTrusted(plugin("one"));
    await first.enable("one");
    expect(await contextOf("A:one").storage.get("config")).toEqual({ title: "原值" });
    await contextOf("A:one").storage.delete("config");
    expect(await contextOf("A:one").storage.get("config")).toBeUndefined();
    await Promise.all([first.dispose(), second.dispose()]);
  });

  it("命令重复、插件重复和不兼容版本明确失败", async () => {
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    const plugin = definition(() => ({
      activate(ctx) {
        ctx.commands.register({ id: "echo", title: "回声", run: value => value });
        ctx.commands.register({ id: "echo", title: "重复", run: value => value });
      },
    }));
    host.registerTrusted(plugin);
    expect(() => host.registerTrusted(plugin)).toThrow("插件已注册");
    expect(() => host.registerTrusted({ ...plugin, id: "other", apiVersion: 2 as 1 })).toThrow(
      "API 版本"
    );
    await expect(host.enable(plugin.id)).rejects.toThrow("命令已注册");
    expect(host.listCommands()).toEqual([]);
    await host.dispose();
  });

  it("命令异常和非法 JSON 不影响后续调用", async () => {
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    host.registerTrusted(
      definition(() => ({
        activate(ctx) {
          ctx.commands.register({
            id: "run",
            title: "运行",
            run: value => {
              if (value === "fail") throw new Error("失败");
              return value;
            },
          });
        },
      }))
    );
    await host.enable("example.notes");
    await expect(host.executeCommand("example.notes:run", "fail")).rejects.toThrow("失败");
    await expect(host.executeCommand("example.notes:run", NaN)).rejects.toThrow("JSON");
    expect(await host.executeCommand("example.notes:run", "正常")).toBe("正常");
    await host.dispose();
  });
});
