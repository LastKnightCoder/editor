import { expect, it, vi } from "vitest";
import { defineEditorExtension, definePlugin, type PluginContext } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

it("插件上下文不提供动态编辑器注册，静态扩展和贡献统计保留", async () => {
  const run = vi.fn();
  const extension = defineEditorExtension({
    id: "sample.editor",
    commands: [{ id: "sample.mark", title: "标记", run }],
    menu: [{ id: "sample.mark", title: "标记", command: "sample.mark" }],
  });
  const definition = definePlugin({
    id: "sample",
    name: "静态扩展",
    version: "1.0.0",
    editorExtensions: [extension],
    create: () => ({
      activate(context: PluginContext) {
        expect(context).not.toHaveProperty("editor");
        context.commands.register({ id: "open", title: "打开", run: () => null });
      },
    }),
  });
  const host = new PluginHost({ workspaceId: "test", storage: createMemoryStorage() });
  try {
    host.registerTrusted(definition);
    await host.enable("sample");
    expect(definition.editorExtensions?.[0].commands?.[0].run).toBe(run);
    expect(definition.editorExtensions?.[0].menu).toMatchObject([{ command: "sample.mark" }]);
    expect(host.listContributions("sample")).toMatchObject({ editor: 1, command: 1 });
    expect(run).not.toHaveBeenCalled();
  } finally {
    await host.dispose();
  }
});

it("静态扩展仍只提取公开字段，不执行私有编辑器钩子", () => {
  const hook = vi.fn();
  const extension = defineEditorExtension(
    Object.assign(Object.create({ plugins: [hook] }), {
      id: "sample.editor",
      commands: [{ id: "sample.run", run: vi.fn() }],
    })
  );
  expect(extension).not.toHaveProperty("plugins");
  expect(extension.commands).toHaveLength(1);
  expect(hook).not.toHaveBeenCalled();
});
