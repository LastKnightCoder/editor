// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readPublishPlugins, PublishPluginCatalog } from "../plugin-publish";
import type { PluginRenderContext } from "@tau/plugins/rendering";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});
const sha = (source: string) => createHash("sha256").update(source).digest("hex");

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "publish-plugins-"));
  directories.push(root);
  const folder = path.join(root, "test.editor");
  await mkdir(folder);
  const manifest = {
    id: "test.editor",
    name: "test",
    version: "1.0.0",
    apiVersion: 1,
    formatVersion: 1,
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    styles: "main.css",
    editor: true,
    integrity: { "main.js": sha("code"), "main.css": sha("style") },
  };
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(folder, "main.js"), "code");
  await writeFile(path.join(folder, "main.css"), "style");
  const context: PluginRenderContext = {
    builtinTypes: ["paragraph", "whiteboard"],
    plugins: [
      {
        id: manifest.id,
        version: manifest.version,
        mainHash: sha("code"),
        stylesHash: sha("style"),
        nodeTypes: ["test.node"],
      },
    ],
  };
  return { root, folder, manifest, context };
}

it("固定磁盘包与编辑器快照，同版本样式变化也拒绝发布", async () => {
  const { root, folder, manifest, context } = await setup();
  expect((await readPublishPlugins(root, context)).plugins).toHaveLength(1);
  await writeFile(path.join(folder, "main.css"), "changed");
  await writeFile(
    path.join(folder, "manifest.json"),
    JSON.stringify({
      ...manifest,
      integrity: { ...manifest.integrity, "main.css": sha("changed") },
    })
  );
  await expect(readPublishPlugins(root, context)).rejects.toThrow("样式已变化");
  await expect(
    readPublishPlugins(root, { ...context, plugins: [{ ...context.plugins[0], id: "../escape" }] })
  ).rejects.toThrow();
});

it("样式来源按节点归属读取，不能借其他类型或无效语言声明", async () => {
  const { root, context } = await setup();
  context.plugins[0].styleSources = [{ type: "test.node", field: "source", language: "tsx" }];
  const catalog = new PublishPluginCatalog(await readPublishPlugins(root, context));
  expect(catalog.styleSources({ type: "test.node", source: "<div/>" })).toEqual([
    { code: "<div/>", extension: "tsx" },
  ]);
  expect(catalog.styleSources({ type: "paragraph", source: "<div/>" })).toEqual([]);
  context.plugins[0].styleSources = [{ type: "paragraph", field: "source", language: "tsx" }];
  await expect(readPublishPlugins(root, context)).rejects.toThrow("样式源码声明");
});

it("只收集用到的包，嵌套页面用相对地址，原始节点和业务私有数据不改写", async () => {
  const { root, context } = await setup();
  const catalog = new PublishPluginCatalog(await readPublishPlugins(root, context));
  expect(
    catalog.dependencies({ content: [{ type: "paragraph", children: [] }] }, "index.html")
  ).toEqual([]);
  expect(catalog.files()).toEqual([]);
  const data = {
    content: [{ type: "test.node", children: [], private: { type: "not-slate", children: [] } }],
  };
  const before = JSON.stringify(data);
  const [dependency] = catalog.dependencies(data, "docs/a/b.html");
  expect(dependency.entry).toMatch(/^\.\.\/\.\.\/plugin-assets\/test.editor\/1.0.0\//);
  expect(catalog.files().map(file => file.content)).toEqual(["code", "style"]);
  expect(JSON.stringify(data)).toBe(before);
  expect(() =>
    catalog.dependencies({ content: [{ type: "missing.node", children: [] }] }, "index.html")
  ).toThrow("缺少");
  catalog.reset();
  expect(catalog.files()).toEqual([]);
});
