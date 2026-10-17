import { describe, expect, it } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { createMemoryStorage, PluginHost, type ExcerptsAdapter } from "../host";

const entry = {
  ref: { kind: "excerpt", id: 7 },
  externalId: "b1:1",
  quote: "甲",
  note: "",
  location: "",
  url: null,
  anchor: null,
  color: null,
  time: null,
  deleted: false,
};

function setup(adapter?: Partial<ExcerptsAdapter>) {
  const calls: unknown[][] = [];
  const excerpts: ExcerptsAdapter = {
    register: (context, definition) => {
      calls.push(["register", context.pluginId, definition.label]);
      return { dispose: () => void calls.push(["unregister", context.pluginId]) };
    },
    replace: async (context, source, items) => {
      calls.push(["replace", context.pluginId, source, items]);
      return { inserted: items.length, updated: 0, deleted: 0 };
    },
    patch: async (_context, _source, change) => ({
      inserted: change.upsert?.length ?? 0,
      updated: 0,
      deleted: change.remove?.length ?? 0,
    }),
    sources: async () => [{ key: "b1", title: "书", count: 1 }],
    items: async () => [entry],
    ...adapter,
  };
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    excerpts,
    materials: {
      actions: async () => [
        { id: "card", label: "转为卡片", run: async () => void calls.push(["card"]) },
      ],
    },
  });
  host.registerTrusted(
    definePlugin({
      id: "weread",
      name: "微信读书",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  return { host, calls, context: () => context };
}

describe("摘录提供方", () => {
  it("写入前须注册；注册随停用回收，写入参数为副本", async () => {
    const { host, calls, context } = setup();
    await host.enable("weread");
    const source = { key: "b1", title: "书" };
    await expect(context().excerpts.replace(source, [])).rejects.toThrow("先注册");
    context().excerpts.register({ label: "微信读书" });
    expect(() => context().excerpts.register({ label: "再次" })).toThrow("已注册");
    const items = [{ externalId: "b1:1", quote: "甲", anchor: { range: "1-2" } }];
    expect(await context().excerpts.replace(source, items)).toEqual({
      inserted: 1,
      updated: 0,
      deleted: 0,
    });
    const passed = calls.find(call => call[0] === "replace")!;
    expect(passed[3]).toEqual(items);
    expect(passed[3]).not.toBe(items);
    expect(await context().excerpts.patch(source, { remove: ["b1:1"] })).toEqual({
      inserted: 0,
      updated: 0,
      deleted: 1,
    });
    expect(await context().excerpts.items("b1")).toEqual([entry]);
    const old = context();
    await host.disable("weread");
    expect(calls.at(-1)).toEqual(["unregister", "weread"]);
    await expect(old.excerpts.replace(source, [])).rejects.toThrow();
    await expect(old.excerpts.sources()).rejects.toThrow();
  });

  it("提前注销后不能继续写入，可重新注册", async () => {
    const { host, context } = setup();
    await host.enable("weread");
    const provider = context().excerpts.register({ label: "微信读书" });
    await provider.dispose();
    await expect(context().excerpts.replace({ key: "b", title: "" }, [])).rejects.toThrow("先注册");
    context().excerpts.register({ label: "微信读书" });
    await expect(context().excerpts.replace({ key: "b", title: "" }, [])).resolves.toBeTruthy();
  });

  it("停用期间完成的写入不把结果交给旧实例", async () => {
    let release!: () => void;
    const { host, context } = setup({
      replace: () =>
        new Promise(resolve => {
          release = () => resolve({ inserted: 1, updated: 0, deleted: 0 });
        }),
    });
    await host.enable("weread");
    context().excerpts.register({ label: "微信读书" });
    const pending = context().excerpts.replace({ key: "b", title: "" }, []);
    await Promise.resolve();
    const disabled = host.disable("weread");
    release();
    await expect(pending).rejects.toThrow();
    await disabled;
  });

  it("材料动作经宿主执行，旧实例的动作失效", async () => {
    const { host, calls, context } = setup();
    await host.enable("weread");
    const [action] = await context().materials.actions({ kind: "excerpt", id: 7 });
    expect(action.label).toBe("转为卡片");
    await action.run();
    expect(calls.at(-1)).toEqual(["card"]);
    await host.disable("weread");
    await expect(action.run()).rejects.toThrow();
  });

  it("宿主未提供摘录能力时明确报错", async () => {
    const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage() });
    let context!: PluginContext;
    host.registerTrusted(
      definePlugin({
        id: "weread",
        name: "微信读书",
        version: "1.0.0",
        create: () => ({ activate: ctx => void (context = ctx) }),
      })
    );
    await host.enable("weread");
    expect(() => context.excerpts.register({ label: "微信读书" })).toThrow("不支持摘录");
    await expect(context.materials.actions({ kind: "excerpt", id: 1 })).rejects.toThrow(
      "不支持材料动作"
    );
  });
});
