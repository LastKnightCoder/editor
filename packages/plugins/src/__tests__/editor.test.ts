import { describe, expect, it, vi } from "vitest";
import { defineEditorExtension, definePlugin, type Disposable, type PluginContext } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

const contribution = () => ({
  scene: "workbench" as const,
  extension: defineEditorExtension({ id: "sample.node" }),
});

describe("编辑器贡献生命周期", () => {
  it("失败回收、手动注销、重新启用和旧作用域失效", async () => {
    const dispose = vi.fn();
    const host = new PluginHost({
      workspaceId: "A",
      storage: createMemoryStorage(),
      editor: { register: () => ({ dispose }) },
    });
    let context!: PluginContext;
    let resource!: Disposable;
    let fail = true;
    host.registerTrusted(
      definePlugin({
        id: "sample",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
            resource = ctx.editor.register(contribution());
            if (fail) throw new Error("激活失败");
          },
        }),
      })
    );
    await expect(host.enable("sample")).rejects.toThrow("激活失败");
    expect(dispose).toHaveBeenCalledTimes(1);
    fail = false;
    await host.enable("sample");
    const previous = context;
    await resource.dispose();
    await host.disable("sample");
    expect(dispose).toHaveBeenCalledTimes(2);
    await host.enable("sample");
    expect(() => previous.editor.register(contribution())).toThrow();
    await host.unregister("sample");
    expect(dispose).toHaveBeenCalledTimes(3);
  });

  it("无编辑器的宿主明确拒绝；根入口可以在没有 DOM 的 Node 使用", async () => {
    expect(typeof document).toBe("undefined");
    const host = new PluginHost({ workspaceId: "A", storage: createMemoryStorage() });
    host.registerTrusted(
      definePlugin({
        id: "sample",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            ctx.editor.register(contribution());
          },
        }),
      })
    );
    await expect(host.enable("sample")).rejects.toThrow("不支持编辑器");
    await host.dispose();
  });
});

it("公开贡献可带附加信息，私有钩子不会交给编辑器宿主执行", async () => {
  const privateHook = vi.fn();
  const render = () => null;
  const captured: unknown[] = [];
  const host = new PluginHost({
    workspaceId: "A",
    storage: createMemoryStorage(),
    editor: {
      register(_context, value) {
        captured.push(value.extension);
        for (const hook of (value.extension as { plugins?: (() => void)[] }).plugins ?? []) hook();
        return { dispose() {} };
      },
    },
  });
  const inherited = Object.assign(Object.create({ plugins: [privateHook] }), {
    id: "sample.node",
    apiVersion: 1,
    elements: [{ type: "sample.node", kind: "block", render }],
    documentation: "extra",
  });
  host.registerTrusted(
    definePlugin({
      id: "sample",
      name: "示例",
      version: "1",
      create: () => ({
        activate(ctx) {
          ctx.editor.register({ scene: "workbench", extension: inherited });
        },
      }),
    })
  );
  try {
    await host.enable("sample");
    expect(privateHook).not.toHaveBeenCalled();
    expect(captured).toMatchObject([{ elements: [{ render }] }]);
  } finally {
    await host.dispose();
  }
});
