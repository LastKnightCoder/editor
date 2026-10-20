// @vitest-environment node
import { expect, it, vi } from "vitest";
import { PublishSiteGenerator } from "../publish-site-generator";
import { makePublishFixture, text } from "./publish-fixtures";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const template = {
  manifest: {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    id: "test.template",
    name: "模板",
    version: "1.0.0",
    template: { protocolVersion: 1 as const, root: "site", entries: ["index.html"] },
    integrity: {},
  },
  files: [
    { path: "index.html", content: Buffer.from('<meta content="__TAU_MANIFEST__">') },
    { path: "favicon.svg", content: Buffer.from("模板自己的图标") },
  ],
};
const generator = () =>
  new PublishSiteGenerator({ template, logger: console, compileTailwind: async () => "" });
const site = { title: "站点", description: "", basePath: "/notes/" };
it("同一项目的共享文档出现在多个分支时保留目录入口，只生成一份正文和搜索记录", async () => {
  const fixture = makePublishFixture();
  const project = fixture.data.getProject(12)!;
  const parent = fixture.data.getProjectItemsByIds([33])[0];
  const child = fixture.data.getProjectItemsByIds([34])[0];
  project.children = [33, 35, 34];
  parent.content = [text("第一分支正文")] as any;
  const secondParent = { ...parent, id: 35, title: "第二分支" };
  fixture.data.getProjectItemsByIds = ids =>
    [parent, child, secondParent].filter(item => ids.includes(item.id));
  const { files } = await generator().generate(fixture.data, fixture.selections, site);
  const docs = files
    .filter(file => /^data\/projects\/12\/\d+\./.test(file.path))
    .map(file => JSON.parse(file.content.toString()));
  expect(docs.map(doc => doc.key)).toEqual([
    "doc:project:12:33",
    "doc:project:12:34",
    "doc:project:12:35",
  ]);
  expect(docs[1].content.breadcrumb.map((item: { label: string }) => item.label)).toEqual([
    "项目说明",
    "目录",
    "共享协议文档",
  ]);
  expect(docs[1].content.prevPage.target.key).toBe("doc:project:12:33");
  expect(docs[1].content.nextPage.target.key).toBe("doc:project:12:35");
  const search = JSON.parse(
    files.find(file => /^data\/search\./.test(file.path))!.content.toString()
  );
  expect(
    search.documents.filter((doc: { key: string }) => doc.key === "doc:project:12:34")
  ).toHaveLength(1);
  const manifest = JSON.parse(
    files.find(file => /^data\/site\./.test(file.path))!.content.toString()
  );
  expect(manifest.projectTrees[12][0].children[0].children[0].target.key).toBe("doc:project:12:34");
  expect(manifest.projectTrees[12][0].children[1].children[0].target.key).toBe("doc:project:12:34");
});
it("关联卡片按正文身份匹配，仅输出已发布目标的摘要与引用", async () => {
  const fixture = makePublishFixture();
  fixture.cards.push({
    ...fixture.cards[0],
    id: 8,
    contentId: 108,
    content: [text("公开关系")] as any,
  });
  fixture.selections.push({ contentType: "card", contentId: 8, parentPath: "" });
  fixture.data.getContentLinkTargetContentIds = () => [108, 999];
  const readPrivate = vi.fn(() => null);
  fixture.data.getCardByContentId = readPrivate;
  const { files } = await generator().generate(
    fixture.data,
    fixture.selections.filter(item => item.contentType !== "quest"),
    site
  );
  const card = JSON.parse(
    files.find(file => file.path.startsWith("data/cards/7."))!.content.toString()
  );
  expect(card.content.linkedCards).toEqual([
    {
      id: 8,
      target: { key: "card:8", type: "card", id: 8 },
      summary: "公开关系",
      tags: ["发布/协议"],
    },
  ]);
  expect(readPrivate).not.toHaveBeenCalled();
});
it("项目读取失败拒绝生成，已删除的项目则按空选择处理", async () => {
  const fixture = makePublishFixture();
  fixture.data.getProject = () => {
    throw new Error("数据库不可用");
  };
  await expect(generator().generate(fixture.data, fixture.selections, site)).rejects.toThrow(
    "数据库不可用"
  );
  fixture.data.getProject = () => null;
  const { files } = await generator().generate(fixture.data, fixture.selections, site);
  expect(files.some(file => file.path.startsWith("data/projects/"))).toBe(false);
});
it("宿主图标使用协议资源目录，与作者同名资产共存", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-favicon-"));
  try {
    const bytes = Buffer.from("<svg></svg>");
    const cachePath = path.join(directory, "icon.svg");
    await writeFile(cachePath, bytes);
    const fixture = makePublishFixture();
    const { files } = await generator().generate(fixture.data, fixture.selections, {
      ...site,
      favicon: { cachePath, fileName: "icon.svg", format: "svg", updatedAt: 1 },
    });
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(files.find(file => file.path === "favicon.svg")?.content.toString()).toBe(
      "模板自己的图标"
    );
    expect(files.some(file => file.path === `_tau/site/${hash}.svg`)).toBe(true);
    const manifest = JSON.parse(
      files.find(file => file.path.startsWith("data/site."))!.content.toString()
    );
    expect(manifest.site.favicon.href).toBe(`/notes/_tau/site/${hash}.svg`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
