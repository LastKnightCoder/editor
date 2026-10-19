// @vitest-environment node
import { expect, it } from "vitest";
import { PublishSiteGenerator } from "../publish-site-generator";
import { planPublication, describeRelease } from "../publish-release-state";
import { makePublishFixture } from "./publish-fixtures";
import type { TemplatePackage } from "../../services/template-package";
import type { IPublishFile, IPublishHistory } from "@/types/publish";
const template = (id = "test.template"): TemplatePackage => ({
  manifest: {
    formatVersion: 1,
    apiVersion: 1,
    platform: "desktop",
    id,
    name: "模板",
    version: "1.0.0",
    template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
    integrity: {},
  },
  files: [
    {
      path: "index.html",
      content: Buffer.from(
        '<meta name="manifest" content="__TAU_MANIFEST__"><script src="__TAU_CLIENT__tau-publish-data.js"></script>'
      ),
    },
    { path: "assets/style.css", content: Buffer.from("body { color: red; }") },
  ],
});
async function generate(title?: string, id?: string, exclude?: number) {
  const fixture = makePublishFixture(title);
  return new PublishSiteGenerator({
    template: template(id),
    clientSource: "var TauPublish={};",
    compileTailwind: async () => ".text-red-500 {color:red}",
    logger: console,
  }).generate(
    fixture.data,
    fixture.selections.filter(item => item.contentType !== "article" || item.contentId !== exclude),
    { title: "站点", description: "说明", basePath: "/notes/" }
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
it("六类数据、索引、CSS 与引用闭合，宿主不生成业务页面", async () => {
  const { files } = await generate();
  expect(files.filter(file => file.path.endsWith(".html")).map(file => file.path)).toEqual([
    "index.html",
  ]);
  const manifest = JSON.parse(
    files.find(file => /^data\/site\./.test(file.path))!.content.toString()
  );
  expect(new Set(manifest.items.map((item: any) => item.type))).toEqual(
    new Set(["home", "card", "article", "doc", "quest", "list"])
  );
  expect(
    manifest.items.every(
      (item: any) => !item.href && files.some(file => file.path === "data/" + item.data)
    )
  ).toBe(true);
  const article = JSON.parse(
    files.find(file => /^data\/articles\/1\./.test(file.path))!.content.toString()
  );
  expect(article.contentLinkTargets["project-item:34"]).toEqual({
    key: "doc:project:12:34",
    type: "doc",
    id: 34,
  });
  expect(article.contentStyles[0].href).toMatch(/^\.\.\/styles\/[a-f0-9]{64}\.css$/);
  expect(article).not.toHaveProperty("navigation");
  expect(article).not.toHaveProperty("site");
  expect(files.find(file => file.publicationEntry)!.content.toString()).toContain(
    "/notes/data/site."
  );
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
});
it("动态样式失败在生成阶段拒绝，不发布缺样式数据", async () => {
  const fixture = makePublishFixture();
  const generator = new PublishSiteGenerator({
    template: template(),
    logger: { info() {}, warn() {}, error() {} },
    compileTailwind: async () => {
      throw new Error("compile");
    },
  });
  await expect(
    generator.generate(fixture.data, fixture.selections, {
      title: "站点",
      description: "",
      basePath: "/",
    })
  ).rejects.toThrow("动态样式");
});
