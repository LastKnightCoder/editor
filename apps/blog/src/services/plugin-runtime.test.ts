import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import { loadPublishedPlugins, loadPublishedPluginDefinitions } from "./plugin-runtime";
import { publishedPluginDefinitions, setPublishedPlugins } from "./plugin-registry";
import { validatePluginManifest } from "@tau/plugins/package";
import type { PublishedPluginRender } from "@tau/plugins/rendering";
const code = `module.exports.default=require('@tau/plugins').definePlugin({id:'test.editor',name:'test',version:'1.0.0',editorExtensions:[{id:'test.node',apiVersion:1,elements:[{type:'test.node',kind:'block',render:()=>null}]}],create(){throw Error('博客不能调用 create')}});`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const dependency: PublishedPluginRender = {
  runtimeVersion: 1,
  manifest: validatePluginManifest({
    id: "test.editor",
    name: "test",
    version: "1.0.0",
    apiVersion: 1,
    formatVersion: 1,
    main: "main.js",
    styles: "main.css",
    platform: "desktop",
    format: "cjs",
    editor: true,
    integrity: { "main.js": hash(code), "main.css": hash(".test{}") },
  }),
  entry: "/main.js",
  styles: "/main.css",
  nodeTypes: ["test.node"],
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setPublishedPlugins([]);
  document.head.querySelectorAll("style[data-tau-editor-plugin]").forEach(style => style.remove());
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => new Response(url.pathname.endsWith(".css") ? ".test{}" : code))
  );
});

it("按清单验证并加载同一个入口及样式，不执行桌面生命周期", async () => {
  await loadPublishedPlugins([dependency]);
  expect(publishedPluginDefinitions()[0].id).toBe("test.editor");
  expect(document.head.querySelector("style[data-tau-editor-plugin]")?.textContent).toBe(".test{}");
});
it("摘要不匹配或未来协议拒绝加载，不留下已加载贡献", async () => {
  await expect(
    loadPublishedPlugins([
      {
        ...dependency,
        manifest: {
          ...dependency.manifest,
          integrity: { ...dependency.manifest.integrity, "main.js": "0".repeat(64) },
        },
      },
    ])
  ).rejects.toThrow("摘要");
  await expect(loadPublishedPlugins([{ ...dependency, runtimeVersion: 2 as 1 }])).rejects.toThrow(
    "协议"
  );
  expect(publishedPluginDefinitions()).toEqual([]);
});
it("重复节点/插件清单失败时回收本次注入的样式", async () => {
  await expect(loadPublishedPlugins([dependency, dependency])).rejects.toThrow("重复");
  expect(document.head.querySelector("style[data-tau-editor-plugin]")).toBeNull();
  expect(publishedPluginDefinitions()).toEqual([]);
});

it("链接预览按目标页面解析资源，独立 Kit 不替换当前页的贡献", async () => {
  await loadPublishedPlugins([dependency]);
  const original = publishedPluginDefinitions()[0];
  const preview = await loadPublishedPluginDefinitions(
    [{ ...dependency, entry: "../main.js", styles: "../main.css" }],
    "https://example.test/articles/2.html"
  );
  expect(publishedPluginDefinitions()[0]).toBe(original);
  expect(
    vi.mocked(fetch).mock.calls.some(([url]) => String(url) === "https://example.test/main.js")
  ).toBe(true);
  expect(document.head.querySelectorAll("style[data-tau-editor-plugin]")).toHaveLength(2);
  preview.dispose();
  expect(document.head.querySelectorAll("style[data-tau-editor-plugin]")).toHaveLength(1);
});
