import { afterEach, expect, it, vi } from "vitest";
import { createPortableContentRuntime } from "@tau/plugins/portable";
import { definePlugin, defineEditorExtension, defineEditorElement } from "@tau/plugins";
import { validatePluginManifest } from "@tau/plugins/package";

const artifact = {
  manifest: validatePluginManifest({
    id: "test.portable",
    name: "测试",
    version: "1.0.0",
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    editor: true,
    integrity: { "main.js": "a".repeat(64) },
  }),
  css: ".portable { display: block; }",
  evaluate: () =>
    definePlugin({
      id: "test.portable",
      name: "测试",
      version: "1.0.0",
      editorExtensions: [
        defineEditorExtension({
          id: "test.portable",
          elements: [
            defineEditorElement({ type: "test.portable", kind: "block", render: () => null }),
          ],
        }),
      ],
    }),
};
afterEach(() => {
  vi.restoreAllMocks();
  document.head
    .querySelectorAll('style[data-tau-editor-plugin="test.portable"]')
    .forEach(style => style.remove());
});

it("并发启动只加载一次、样式只装配一次", async () => {
  const load = vi.fn(async () => artifact);
  const runtime = createPortableContentRuntime(async () => [load]);
  await Promise.all([runtime.initialize(), runtime.initialize()]);
  await runtime.initialize();
  expect(load).toHaveBeenCalledOnce();
  expect(runtime.registry.list()).toHaveLength(1);
  expect(
    document.head.querySelectorAll('style[data-tau-editor-plugin="test.portable"]')
  ).toHaveLength(1);
});

it("样式安装失败回滚注册状态，再次启动能够恢复", async () => {
  const runtime = createPortableContentRuntime(async () => [async () => artifact]);
  vi.spyOn(document.head, "append").mockImplementationOnce(() => {
    throw new Error("安装失败");
  });
  await expect(runtime.initialize()).rejects.toThrow("安装失败");
  expect(runtime.registry.list()).toEqual([]);
  expect(document.head.querySelector('style[data-tau-editor-plugin="test.portable"]')).toBeNull();
  await runtime.initialize();
  expect(runtime.registry.list()).toHaveLength(1);
});
