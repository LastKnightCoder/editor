import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage, type PluginSidebarItemState } from "../host";

async function setup() {
  const updates: PluginSidebarItemState[] = [];
  const host = new PluginHost({
    workspaceId: "A",
    storage: createMemoryStorage(),
    pages: { register: () => ({ id: "sample:page", open: async () => {}, dispose: () => {} }) },
    sidebar: {
      registerGroup: () => ({ id: "group", dispose: () => {} }),
      registerItem: () => ({ update: state => updates.push(state), dispose: () => {} }),
    },
  });
  let context!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: "Sample.Plugin",
      name: "示例",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("Sample.Plugin");
  const page = context.pages.register({ id: "page", title: "页面", component: () => null });
  const item = context.sidebar.registerItem({ id: "item", title: "入口", page });
  return { host, context, item, updates };
}

describe("侧边栏条目句柄", () => {
  it("只改传入的字段，参数规范化，拖拽类型加插件命名空间", async () => {
    const { host, context, item, updates } = await setup();
    const run = vi.fn();
    item.update({
      badge: 3,
      children: [
        {
          id: "g1",
          title: "分组",
          params: { z: 1, a: "x" },
          tone: "blue",
          count: 2,
          menu: [{ title: "删除", danger: true, run }],
          onDrop: { type: "question", run },
        },
      ],
      action: { title: "新建分组", run },
    });
    item.update({ badge: null });
    const state = updates.at(-1)!;
    expect(state.badge).toBe(0);
    expect(Object.keys(state.children[0].params)).toEqual(["a", "z"]);
    expect(state.children[0].onDrop?.type).toBe("application/x-tau-plugin.sample.plugin.question");
    expect(context.sidebar.dragType("question")).toBe(state.children[0].onDrop?.type);
    expect(state.action?.title).toBe("新建分组");
    state.children[0].menu?.[0].run();
    state.children[0].onDrop?.run("42");
    expect(run).toHaveBeenNthCalledWith(2, "42");
    item.update({ action: null, children: [] });
    expect(updates.at(-1)).toMatchObject({ badge: 0, children: [], action: null });
    await host.dispose();
  });

  it("拒绝无效内容；停用或移除后不再调用插件回调", async () => {
    const { host, item, updates } = await setup();
    const child = { id: "a", title: "A", params: {} };
    expect(() => item.update({ badge: -1 })).toThrow("非负整数");
    expect(() => item.update({ children: [child, child] })).toThrow("重复");
    expect(() => item.update({ children: [{ ...child, title: " " }] })).toThrow("标题");
    expect(() => item.update({ children: [{ ...child, tone: "red" as never }] })).toThrow("色点");
    expect(() =>
      item.update({ children: [{ ...child, onDrop: { type: "a b", run: () => {} } }] })
    ).toThrow("插件标识");
    expect(updates).toHaveLength(0);
    const run = vi.fn();
    item.update({ action: { title: "新建", run } });
    const action = updates.at(-1)!.action!;
    await item.dispose();
    expect(() => action.run()).toThrow("已移除");
    expect(() => item.update({ badge: 1 })).toThrow("已移除");
    await host.disable("Sample.Plugin");
    expect(() => action.run()).toThrow("失效");
    expect(run).not.toHaveBeenCalled();
    await host.dispose();
  });
});
