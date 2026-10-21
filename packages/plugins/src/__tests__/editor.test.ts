import { describe, expect, it, vi } from "vitest";
import { defineEditorExtension, definePlugin, type Disposable, type PluginContext } from "../index";
import { createMemoryStorage, PluginHost } from "../host";
import { assertPluginEditorExtension } from "../editor-fields";

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
    expect(() => defineEditorExtension({ id: "bad", plugins: undefined })).toThrow("原始 Slate");
    await host.dispose();
  });
});

describe("编辑器扩展字段白名单", () => {
  const extension = (extra: Record<string, unknown>) => ({
    id: "sample.node",
    apiVersion: 1,
    ...extra,
  });

  it.each(["inputRules", "marks", "decorations", "layers", "toolbar", "menuFor"])(
    "绕过类型带上未开放的 %s 时开发台注册失败，且不交给宿主",
    async field => {
      const register = vi.fn(() => ({ dispose: () => undefined }));
      const host = new PluginHost({
        workspaceId: "A",
        storage: createMemoryStorage(),
        editor: { register },
      });
      host.registerTrusted(
        definePlugin({
          id: "sample",
          name: "示例",
          version: "1",
          create: () => ({
            activate(ctx) {
              ctx.editor.register({
                scene: "workbench",
                extension: extension({ [field]: [] }) as never,
              });
            },
          }),
        })
      );
      await expect(host.enable("sample")).rejects.toThrow(`未开放的字段：${field}`);
      expect(register).not.toHaveBeenCalled();
      await host.dispose();
    }
  );

  it("继承或不可枚举的字段同样拒绝", () => {
    const inherited = Object.assign(Object.create({ inputRules: [] }), extension({}));
    expect(() => assertPluginEditorExtension(inherited)).toThrow("普通对象");
    const hidden = extension({});
    Object.defineProperty(hidden, "marks", { value: [], enumerable: false });
    expect(() => assertPluginEditorExtension(hidden)).toThrow("未开放的字段：marks");
  });

  it("开放字段与插件专用字段照常通过", () => {
    expect(() =>
      assertPluginEditorExtension(
        defineEditorExtension({
          id: "sample.node",
          elements: [],
          commands: [],
          hotkeys: [],
          menu: [],
          blockPanel: [],
          behaviorsFor: {},
          styleSources: [],
          htmlSerializers: [],
        })
      )
    ).not.toThrow();
    expect(() => defineEditorExtension({ id: "sample.node", marks: [] } as never)).toThrow(
      "未开放的字段：marks"
    );
  });
});
