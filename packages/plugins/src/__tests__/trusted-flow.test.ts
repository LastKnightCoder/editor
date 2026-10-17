import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost } from "../host";
import { createFileStorage } from "../file-storage";

const directories: string[] = [];
const hosts: PluginHost[] = [];
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "tau-trusted-flow-"));
  directories.push(directory);
  const storage = createFileStorage({ directory });
  return (workspaceId = "workspace-a") => {
    const host = new PluginHost({ workspaceId, storage });
    hosts.push(host);
    return host;
  };
}
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.dispose()));
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe("可信插件正式宿主与文件存储集成", () => {
  it("保留实例状态，重新启用创建新实例，宿主重建保留数据及删除结果", async () => {
    const makeHost = await setup();
    const events: string[] = [];
    const plugin = definePlugin({
      id: "flow.counter",
      name: "流程样本",
      version: "1.0.0",
      create() {
        let count = 0;
        let context: PluginContext;
        events.push("create");
        return {
          activate(ctx) {
            context = ctx;
            ctx.commands.register({ id: "count", title: "实例计数", run: () => ++count });
            ctx.commands.register({
              id: "set",
              title: "保存",
              run: async value => {
                await ctx.storage.set("value", value);
                return true;
              },
            });
            ctx.commands.register({
              id: "get",
              title: "读取",
              run: async () => (await ctx.storage.get("value")) ?? null,
            });
            ctx.commands.register({
              id: "delete",
              title: "删除",
              run: async () => {
                await ctx.storage.delete("value");
                return true;
              },
            });
            ctx.register({
              dispose: () => {
                events.push("first");
              },
            });
            ctx.register({
              dispose: () => {
                events.push("second");
              },
            });
          },
          deactivate() {
            expect(context.signal.aborted).toBe(true);
            events.push("deactivate");
          },
        };
      },
    });
    const first = makeHost();
    first.registerTrusted(plugin);
    await Promise.all([first.enable(plugin.id), first.enable(plugin.id)]);
    expect(events).toEqual(["create"]);
    expect(await first.executeCommand("flow.counter:count")).toBe(1);
    expect(await first.executeCommand("flow.counter:count")).toBe(2);
    const value = { text: "正文", options: [true, null, 3] };
    await first.executeCommand("flow.counter:set", value);
    value.text = "调用后修改";
    await first.disable(plugin.id);
    expect(first.listCommands()).toEqual([]);
    expect(events.slice(-3)).toEqual(["deactivate", "second", "first"]);
    await first.enable(plugin.id);
    expect(await first.executeCommand("flow.counter:count")).toBe(1);
    expect(await first.executeCommand("flow.counter:get")).toEqual({
      text: "正文",
      options: [true, null, 3],
    });
    await first.unregister(plugin.id);
    const second = makeHost();
    second.registerTrusted(plugin);
    await second.enable(plugin.id);
    expect(await second.executeCommand("flow.counter:get")).toEqual({
      text: "正文",
      options: [true, null, 3],
    });
    await second.executeCommand("flow.counter:delete");
    await second.dispose();
    const third = makeHost();
    third.registerTrusted(plugin);
    await third.enable(plugin.id);
    expect(await third.executeCommand("flow.counter:get")).toBeNull();
  });

  it("同名命令和私有键在多个插件、多个工作区分别工作", async () => {
    const makeHost = await setup();
    const plugin = (id: string) =>
      definePlugin({
        id,
        name: id,
        version: "1.0.0",
        create: () => ({
          activate(ctx) {
            ctx.commands.register({
              id: "set",
              title: "保存",
              run: async value => {
                await ctx.storage.set("same", value);
                return true;
              },
            });
            ctx.commands.register({
              id: "get",
              title: "读取",
              run: async () => (await ctx.storage.get("same")) ?? null,
            });
          },
        }),
      });
    const a = makeHost("a");
    const b = makeHost("b");
    for (const host of [a, b])
      for (const id of ["one", "two"]) {
        host.registerTrusted(plugin(id));
        await host.enable(id);
      }
    await a.executeCommand("one:set", "a-one");
    await a.executeCommand("two:set", "a-two");
    await b.executeCommand("one:set", "b-one");
    expect(await a.executeCommand("one:get")).toBe("a-one");
    expect(await a.executeCommand("two:get")).toBe("a-two");
    expect(await b.executeCommand("one:get")).toBe("b-one");
    expect(await b.executeCommand("two:get")).toBeNull();
  });

  it("激活失败回收命令和资源，保留已经提交的数据并允许修复后重试", async () => {
    const makeHost = await setup();
    const host = makeHost();
    let fail = true;
    let cleaned = 0;
    const plugin = definePlugin({
      id: "failure",
      name: "失败恢复",
      version: "1.0.0",
      create: () => ({
        async activate(ctx) {
          ctx.commands.register({
            id: "get",
            title: "读取",
            run: async () => (await ctx.storage.get("saved")) ?? null,
          });
          ctx.register({
            dispose: () => {
              cleaned++;
            },
          });
          if (fail) {
            await ctx.storage.set("saved", "已提交");
            throw Error("样本激活失败");
          }
        },
      }),
    });
    host.registerTrusted(plugin);
    await expect(host.enable(plugin.id)).rejects.toThrow("样本激活失败");
    expect(host.getState(plugin.id)).toBe("failed");
    expect(host.listCommands()).toEqual([]);
    expect(cleaned).toBe(1);
    fail = false;
    await host.enable(plugin.id);
    expect(await host.executeCommand("failure:get")).toBe("已提交");
  });

  it("停用后旧命令不能继续写入，新实例可正常读写", async () => {
    const makeHost = await setup();
    const host = makeHost();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    const plugin = definePlugin({
      id: "late",
      name: "迟到写入",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          ctx.commands.register({
            id: "delayed",
            title: "延迟保存",
            run: async () => {
              entered();
              await gate;
              await ctx.storage.set("value", "旧值");
              return true;
            },
          });
          ctx.commands.register({
            id: "set",
            title: "保存",
            run: async value => {
              await ctx.storage.set("value", value);
              return true;
            },
          });
          ctx.commands.register({
            id: "get",
            title: "读取",
            run: async () => (await ctx.storage.get("value")) ?? null,
          });
        },
      }),
    });
    host.registerTrusted(plugin);
    await host.enable(plugin.id);
    const delayed = host.executeCommand("late:delayed");
    const rejected = expect(delayed).rejects.toThrow();
    await started;
    await host.disable(plugin.id);
    await host.enable(plugin.id);
    await host.executeCommand("late:set", "新值");
    release();
    await rejected;
    expect(await host.executeCommand("late:get")).toBe("新值");
  });
});
