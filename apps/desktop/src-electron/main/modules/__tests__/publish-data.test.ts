// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createClient } from "@tau/plugins/publish-client";
import { PublishSiteGenerator } from "../publish-site-generator";
import { buildPublishSearchIndexPayload } from "../publish-search-index";
import { planPublication, describeRelease } from "../publish-release-state";
import { makePublishFixture } from "./publish-fixtures";
import type { TemplatePackage } from "../../services/template-package";
import type { IPublishFile, IPublishHistory } from "@/types/publish";
import { createHash } from "node:crypto";
import type { PublishPluginSnapshot } from "../../services/plugin-publish";

const code = "throw Error('发布器不得执行插件入口')";
const plugins: PublishPluginSnapshot = {
  builtinTypes: ["paragraph", "formatted", "content-link"],
  plugins: [
    { id: "test.counter", nodeTypes: ["example.portable-counter"] },
    { id: "test.html", nodeTypes: ["html-block", "html-inline"] },
  ].map(({ id, nodeTypes }) => ({
    nodeTypes,
    styleSources:
      id === "test.html"
        ? nodeTypes.map(type => ({ type, field: "html", language: "html" as const }))
        : [],
    artifact: {
      code,
      manifest: {
        id,
        name: id,
        version: "1.0.0",
        formatVersion: 3,
        apiVersion: 1,
        platform: "portable" as const,
        format: "cjs",
        main: "main.js",

        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },

        profile: "web-v1" as const,
        targets: { desktop: { minAppVersion: "0.0.0" } },
      },
    },
  })),
};
const template = (id = "test.template"): TemplatePackage => ({
  manifest: {
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    id,
    name: "模板",
    version: "1.0.0",
    template: {
      protocolVersion: 1,
      root: "site",
      entries: ["index.html"],
      siteFields: [
        { key: "description", label: "站点描述", type: "textarea" },
        { key: "showStats", label: "显示统计", type: "switch", default: true },
      ],
    },
    integrity: {},
  },
  files: [
    {
      path: "index.html",
      content: Buffer.from(
        '<meta name="manifest" content="__TAU_MANIFEST__"><script src="__TAU_BASE__assets/app.js"></script>'
      ),
    },
    { path: "assets/style.css", content: Buffer.from("body { color: red; }") },
  ],
});
async function generate(title?: string, id?: string, exclude?: number) {
  const fixture = makePublishFixture(title);
  return new PublishSiteGenerator({
    buildSearchIndex: async input => buildPublishSearchIndexPayload(input),
    template: template(id),
    plugins,
    compileTailwind: async () => ".text-red-500 {color:red}",
    logger: console,
  }).generate(
    fixture.data,
    fixture.selections.filter(item => item.contentType !== "article" || item.contentId !== exclude),
    { title: "站点", basePath: "/notes/", fieldValues: { description: "说明", extra: "丢弃" } }
  );
}
const history = (files: IPublishFile[]) =>
  files.map((file, index) => ({
    id: index,
    filePath: file.path,
    contentHash: file.hash,
    sourceType: file.sourceType,
    sourceId: file.sourceId,
    publishTime: 1,
  })) as IPublishHistory[];
it("生成的清单能被公开数据客户端读取", async () => {
  const { files } = await generate();
  const site = files.find(file => /^data\/site\./.test(file.path))!;
  const byUrl = new Map(files.map(file => ["https://example.com/notes/" + file.path, file]));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const content = byUrl.get(url)!.content;
      return new Response(typeof content === "string" ? content : new Uint8Array(content));
    })
  );
  try {
    const client = createClient({ manifestUrl: "https://example.com/notes/" + site.path });
    const manifest = await client.readManifest();
    expect(manifest.site.fields).toEqual({ description: "说明", showStats: true });
    const home = manifest.items.find(item => item.type === "home")!;
    const result = await client.readData({ key: home.key });
    expect(result.data).toMatchObject({ key: home.key, meta: { type: "home" } });
    expect(result.data.content).not.toHaveProperty("hero");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("未知节点仅回传警告，继续生成完整发布产物并原样保留节点", async () => {
  const fixture = makePublishFixture();
  const unknown = {
    type: "ai",
    prompt: "保留字段",
    children: [{ type: "formatted", text: "AI 正文" }],
  };
  fixture.articles[0].content.push(unknown as never);
  const generator = new PublishSiteGenerator({
    buildSearchIndex: async input => buildPublishSearchIndexPayload(input),
    template: template(),
    plugins,
    compileTailwind: async () => "",
    logger: console,
  });
  const result = await generator.generate(fixture.data, fixture.selections, {
    title: "站点",
    basePath: "/notes/",
  });
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain("ai");
  const article = JSON.parse(
    result.files.find(file => /^data\/articles\/1\./.test(file.path))!.content.toString()
  );
  expect(article.content.content).toContainEqual(unknown);
  expect(result.files.some(file => file.publicationEntry)).toBe(true);
});
it("五类数据、索引、CSS 与引用闭合，宿主不生成业务页面", async () => {
  const { files } = await generate();
  expect(files.filter(file => file.path.endsWith(".html")).map(file => file.path)).toEqual([
    "index.html",
  ]);
  const manifest = JSON.parse(
    files.find(file => /^data\/site\./.test(file.path))!.content.toString()
  );
  expect(manifest.site.fields).toEqual({ description: "说明", showStats: true });
  expect(new Set(manifest.items.map((item: any) => item.type))).toEqual(
    new Set(["home", "card", "article", "doc", "list"])
  );
  expect(
    manifest.items.every(
      (item: any) => !item.href && files.some(file => file.path === "data/" + item.data)
    )
  ).toBe(true);
  const article = JSON.parse(
    files.find(file => /^data\/articles\/1\./.test(file.path))!.content.toString()
  );
  // 站内链接目标随所在正文输出，只含本文用到且已发布的目标。
  expect(article.links).toEqual({
    "project-item:34": { key: "doc:project:12:34", type: "doc", id: 34 },
    "article:2": { key: "article:2", type: "article", id: 2 },
    "article:1": { key: "article:1", type: "article", id: 1 },
  });
  expect(manifest.settings.appearance.image).toEqual({ borderRadius: "md", shadow: "none" });
  expect(manifest.projectTrees["12"].length).toBeGreaterThan(0);
  // 站点级数据只进清单，各内容文件不重复携带。
  for (const file of files.filter(file => /^data\/.+\.json$/.test(file.path))) {
    const value = JSON.parse(file.content.toString());
    if (!value.key) continue;
    for (const field of ["tree", "collections", "cardTagTree", "settings"])
      expect(value).not.toHaveProperty(field);
  }
  expect(article.contentStyles[0].href).toMatch(/^\.\.\/styles\/[a-f0-9]{64}\.css$/);
  expect(article).not.toHaveProperty("navigation");
  expect(article).not.toHaveProperty("site");
  const entry = files.find(file => file.publicationEntry)!.content.toString();
  expect(entry).toContain("/notes/data/site.");
  expect(entry).toContain('src="/notes/assets/app.js"');
  expect(files.some(file => file.path.startsWith("_tau/client/"))).toBe(false);
});
it("重复生成及换模板不改变内容 JSON、CSS 或搜索索引", async () => {
  const first = (await generate()).files.filter(file => file.path.startsWith("data/"));
  expect((await generate()).files.filter(file => file.path.startsWith("data/"))).toEqual(first);
  expect(
    (await generate(undefined, "different.template")).files.filter(file =>
      file.path.startsWith("data/")
    )
  ).toEqual(first);
});

it("计划预览只需文件元信息与依赖描述，结果与完整发布一致", async () => {
  const files = (await generate()).files;
  const full = planPublication(files, []);
  const metadata = files.map(({ content: _content, ...file }) => file);
  const preview = planPublication(metadata, [], undefined, describeRelease(files));
  expect(preview.toUpload.map(file => file.path)).toEqual(full.toUpload.map(file => file.path));
  expect(preview.releaseState).toEqual(full.releaseState);
  expect(preview.toUpload.every(file => !("content" in file))).toBe(true);
});
it("增量发布仅上传变更，保留一轮旧依赖，无变化不推进保留窗口，撤下清除旧数据", async () => {
  const first = (await generate()).files;
  const state = planPublication(first, []).releaseState;
  const second = (await generate("修改文章")).files;
  const plan = planPublication(second, history(first), state);
  expect(plan.toUpload.some(file => /^data\/articles\/3\./.test(file.path))).toBe(false);
  expect(plan.toDelete).toEqual([]);
  const retained = [...first, ...second.filter(file => !first.some(old => old.path === file.path))];
  expect(
    planPublication(second, history(retained), plan.releaseState).releaseState?.previous
  ).toEqual(state?.current);
  const removed = (await generate("修改文章", undefined, 2)).files;
  const withdrawal = planPublication(removed, history(retained), plan.releaseState);
  expect(withdrawal.toDelete.some(path => /^data\/articles\/2\./.test(path))).toBe(true);
  expect(withdrawal.toDelete.some(path => /^data\/search\./.test(path))).toBe(true);
  // 撤下文章只影响清单、聚合与索引，其余内容文件的摘要不变。
  expect(withdrawal.toUpload.some(file => /^data\/(?:cards|projects)\//.test(file.path))).toBe(
    false
  );
});
it("动态样式失败在生成阶段拒绝，不发布缺样式数据", async () => {
  const fixture = makePublishFixture();
  const generator = new PublishSiteGenerator({
    buildSearchIndex: async input => buildPublishSearchIndexPayload(input),
    template: template(),
    plugins,
    logger: { info() {}, warn() {}, error() {} },
    compileTailwind: async () => {
      throw new Error("compile");
    },
  });
  await expect(
    generator.generate(fixture.data, fixture.selections, {
      title: "站点",
      basePath: "/",
    })
  ).rejects.toThrow("动态样式");
});

it("项目卡片列表解析 entityRef，保留卡片快照且撤下目标后移除卡片", async () => {
  const fixture = makePublishFixture();
  const list = {
    type: "project-card-list" as const,
    entityRef: { sourceId: "library", kind: "project-item" as const, entityId: "parent-33" },
    children: [{ type: "formatted" as const, text: "" }],
  };
  fixture.data.resolveProjectItemId = reference => (reference.entityId === "parent-33" ? 33 : null);
  fixture.articles[0].content = [list];
  fixture.cards[0].content = [list];
  const parent = fixture.data.getProjectItemsByIds([33])[0];
  parent.content = [list];
  const original = structuredClone(parent.content);
  const generator = new PublishSiteGenerator({
    buildSearchIndex: async input => buildPublishSearchIndexPayload(input),
    template: template(),
    plugins,
    compileTailwind: async () => "",
    logger: console,
  });
  const site = { title: "站点", description: "", basePath: "/notes/" };
  const first = await generator.generate(fixture.data, fixture.selections, site);
  const read = (files: IPublishFile[], stem: string) =>
    JSON.parse(files.find(file => file.path.startsWith(`data/${stem}.`))!.content.toString());
  for (const stem of ["articles/1", "cards/7", "projects/12/33"]) {
    const value = read(first.files, stem);
    const body = value.content.content;
    expect(body[0]).toMatchObject({
      type: "project-card-list",
      items: [
        {
          id: 34,
          title: "共享协议文档",
          summary: "项目共享协议",
          target: { key: "doc:project:12:34", type: "doc", id: 34 },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("content-link");
  }
  const search = read(first.files, "search");
  expect(search.documents.find((doc: any) => doc.key === "article:1").content).toContain(
    "共享协议文档"
  );
  expect(parent.content).toEqual(original);
  const partial = fixture.selections.map(selection =>
    selection.contentType === "project"
      ? { ...selection, parentPath: JSON.stringify({ mode: "partial", nodes: [33] }) }
      : selection
  );
  const second = await generator.generate(fixture.data, partial, site);
  const article = read(second.files, "articles/1");
  expect(article.links).toBeUndefined();
  expect(article.content.content[0]).toMatchObject({ type: "project-card-list", items: [] });
  expect(JSON.stringify(article)).not.toContain("共享协议文档");
  parent.children = [];
  parent.content = [
    { type: "paragraph", children: [{ type: "formatted", text: "已改为普通正文" }] },
  ];
  const third = await generator.generate(fixture.data, fixture.selections, site);
  expect(read(third.files, "articles/1").content.content[0].items).toEqual([]);
});
