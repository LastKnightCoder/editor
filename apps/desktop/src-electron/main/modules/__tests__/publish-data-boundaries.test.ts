// @vitest-environment node
import { expect, it, vi } from "vitest";
import { PublishSiteGenerator } from "../publish-site-generator";
import { makePublishFixture, text } from "./publish-fixtures";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describeRelease, planPublication } from "../publish-release-state";
import PathUtil from "../../utils/PathUtil";
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
const site = { title: "站点", basePath: "/notes/" };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
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
  const { files } = await generator().generate(fixture.data, fixture.selections, site);
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

it("本地图片按内容去重并改写发布副本，覆盖内置、行内与插件声明的嵌套和预览字段", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-publish-images-"));
  const home = vi.spyOn(PathUtil, "getHomeDir").mockReturnValue(directory);
  const app = vi.spyOn(PathUtil, "getAppDir").mockReturnValue(directory);
  try {
    const bytes = Buffer.from("本地原图");
    const original = path.join(directory, "原图 空格.png");
    const alias = path.join(directory, "same.jpeg");
    await writeFile(original, bytes);
    await writeFile(alias, bytes);
    const image = (url: string) => ({
      type: "image",
      url,
      children: [{ type: "formatted", text: "" }],
    });
    const fixture = makePublishFixture();
    fixture.articles[0].content = [
      image(original),
      image(pathToFileURL(original).href),
      image(`~/${path.basename(original)}`),
      image(`ltoh:///${original}`),
      image(`http://localhost:24678/images/${encodeURIComponent(path.basename(original))}`),
      {
        type: "example.gallery",
        images: [{ source: original, cropped: alias, other: original }],
        children: [{ type: "formatted", text: "" }],
      },
      image("https://example.invalid/remote.png"),
      image("data:image/png;base64,eA=="),
      { type: "audio", src: original, children: [{ type: "formatted", text: "" }] },
    ] as unknown as (typeof fixture.articles)[0]["content"];
    fixture.cards[0].content = [
      { ...image(alias), type: "inline-image" },
    ] as (typeof fixture.cards)[0]["content"];
    const doc = fixture.data.getProjectItemsByIds([34])[0];
    doc.content = [image(original)] as typeof doc.content;
    // 本机服务引用按应用目录解析，不经过网络读取。
    await mkdir(path.join(directory, "images"));
    await writeFile(path.join(directory, "images", path.basename(original)), bytes);
    const before = JSON.stringify({ articles: fixture.articles, cards: fixture.cards, doc });
    const result = await new PublishSiteGenerator({
      template,
      logger: console,
      compileTailwind: async () => "",
      resourceDeclarations: {
        "example.gallery": [{ path: "images[].source", kind: "image", preview: "cropped" }],
      },
    }).generate(fixture.data, fixture.selections, site);
    expect(result.imageWarnings).toEqual([]);
    expect(JSON.stringify({ articles: fixture.articles, cards: fixture.cards, doc })).toBe(before);
    const media = result.files.filter(file => file.path.startsWith("_tau/media/"));
    expect(media).toHaveLength(1);
    expect(media[0].content).toEqual(bytes);
    const article = JSON.parse(
      result.files.find(file => file.path.startsWith("data/articles/1."))!.content.toString()
    );
    const url = site.basePath + media[0].path;
    expect(article.content.content.slice(0, 5).map((node: { url: string }) => node.url)).toEqual(
      Array(5).fill(url)
    );
    expect(article.content.content[5].images).toEqual([
      { source: url, cropped: url, other: original },
    ]);
    expect(article.content.content[6].url).toBe("https://example.invalid/remote.png");
    expect(article.content.content[7].url).toBe("data:image/png;base64,eA==");
    expect(article.content.content[8].src).toBe(original);
    const release = describeRelease(result.files);
    for (const key of ["article:1", "card:7", "doc:project:12:34"])
      expect(release.data[key].dependencies).toContain(media[0].path);
    expect(release.assets).not.toContain(media[0].path);
  } finally {
    home.mockRestore();
    app.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

it("缺失和临时图片按所属内容汇总，不阻止生成，也不删除原地址", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-publish-missing-images-"));
  try {
    const fixture = makePublishFixture();
    const missing = path.join(directory, "missing.png");
    const nodes = [missing, missing, "blob:temporary-image"].map(url => ({
      type: "image",
      url,
      children: [{ type: "formatted", text: "" }],
    })) as (typeof fixture.articles)[0]["content"];
    fixture.articles[0].content = nodes;
    fixture.cards[0].content = nodes;
    const result = await generator().generate(fixture.data, fixture.selections, site);
    expect(result.files.some(file => file.publicationEntry)).toBe(true);
    expect(result.imageWarnings).toHaveLength(4);
    expect(result.imageWarnings).toContainEqual(
      expect.objectContaining({
        content: { key: "article:1", type: "article", id: 1 },
        title: "第一篇文章",
        url: missing,
        reason: expect.stringContaining("不存在"),
      })
    );
    expect(result.imageWarnings).toContainEqual(
      expect.objectContaining({ title: "卡片 #7", url: missing })
    );
    const article = JSON.parse(
      result.files.find(file => file.path.startsWith("data/articles/1."))!.content.toString()
    );
    expect(article.content.content).toEqual(nodes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("换图保留上一轮正文依赖，继续发布后清理过期图片，撤下立即清理独占图片", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-publish-image-releases-"));
  try {
    const file = path.join(directory, "image.png");
    const fixture = makePublishFixture();
    fixture.articles[0].content = [
      { type: "image", url: file, children: [{ type: "formatted", text: "" }] },
    ] as (typeof fixture.articles)[0]["content"];
    const history = (files: Awaited<ReturnType<PublishSiteGenerator["generate"]>>["files"]) =>
      files.map(item => ({ filePath: item.path, contentHash: item.hash }));
    await writeFile(file, "第一张图");
    const first = await generator().generate(fixture.data, fixture.selections, site);
    const firstPlan = planPublication(first.files, []);
    const oldImage = first.files.find(item => item.path.startsWith("_tau/media/"))!.path;
    const unchanged = await generator().generate(fixture.data, fixture.selections, site);
    expect(
      planPublication(unchanged.files, history(first.files), firstPlan.releaseState).toUpload
    ).toEqual([]);
    await writeFile(file, "第二张图");
    const second = await generator().generate(fixture.data, fixture.selections, site);
    const secondPlan = planPublication(second.files, history(first.files), firstPlan.releaseState);
    expect(secondPlan.toUpload.some(item => item.path.startsWith("_tau/media/"))).toBe(true);
    expect(secondPlan.toDelete).not.toContain(oldImage);
    const uploaded = [
      ...first.files,
      ...second.files.filter(item => !first.files.some(old => old.path === item.path)),
    ];
    fixture.articles[0].title = "第三轮发布";
    const third = await generator().generate(fixture.data, fixture.selections, site);
    const thirdPlan = planPublication(third.files, history(uploaded), secondPlan.releaseState);
    expect(thirdPlan.toDelete).toContain(oldImage);
    const withdrawn = await generator().generate(
      fixture.data,
      fixture.selections.filter(
        selection => selection.contentType !== "article" || selection.contentId !== 1
      ),
      site
    );
    const withdrawal = planPublication(withdrawn.files, history(uploaded), secondPlan.releaseState);
    for (const image of uploaded.filter(item => item.path.startsWith("_tau/media/")))
      expect(withdrawal.toDelete).toContain(image.path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("复用已发布图片链接后持续保留依赖，最后一处引用撤下才清理，预览与重试使用同一账本规则", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-publish-linked-images-"));
  try {
    const fixture = makePublishFixture();
    const file = path.join(directory, "original.png");
    const bytes = Buffer.from("原图字节");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const mediaPath = `_tau/media/${hash}.png`;
    const image = (url: string) => ({
      type: "image" as const,
      url,
      children: [{ type: "formatted" as const, text: "" }],
    });
    const historyOf = (hashes: Record<string, string>) =>
      Object.entries(hashes).map(([filePath, contentHash]) => ({ filePath, contentHash }));
    await writeFile(file, bytes);
    fixture.articles[0].content = [image(file)];
    const first = await generator().generate(fixture.data, fixture.selections, site);
    const firstPlan = planPublication(first.files, []);
    if (!firstPlan.releaseState) throw new Error("发布状态缺失");
    fixture.articles[0].content = [image(site.basePath + mediaPath)];
    const same = await generator().generate(fixture.data, fixture.selections, site);
    const unchanged = planPublication(
      same.files,
      historyOf(firstPlan.releaseState.published),
      firstPlan.releaseState
    );
    expect(unchanged.toUpload).toEqual([]);
    expect(unchanged.releaseState?.previous).toBeUndefined();
    const sources = [
      `https://example.invalid${site.basePath}${mediaPath}?v=1#preview`,
      `${site.basePath}${mediaPath}`,
      `//example.invalid${site.basePath}${mediaPath}`,
    ];
    fixture.articles[0].content = deepFreeze([image(sources[0])]);
    fixture.articles[1].content = deepFreeze(sources.slice(1).map(image));
    const original = JSON.stringify([fixture.articles[0].content, fixture.articles[1].content]);
    await rm(file);
    const second = await generator().generate(fixture.data, fixture.selections, site);
    expect(second.imageWarnings).toEqual([]);
    expect(second.files.some(item => item.path === mediaPath)).toBe(false);
    expect(JSON.stringify([fixture.articles[0].content, fixture.articles[1].content])).toBe(
      original
    );
    const articleFile = second.files.find(item => item.path.startsWith("data/articles/1."));
    if (!articleFile) throw new Error("文章发布文件缺失");
    expect(JSON.parse(articleFile.content.toString()).content.content[0].url).toBe(sources[0]);

    const history = historyOf(firstPlan.releaseState.published);
    const plan = planPublication(second.files, history, firstPlan.releaseState);
    const described = describeRelease(second.files);
    const beforePreview = JSON.stringify(described);
    const preview = planPublication(
      second.files.map(({ content: _content, ...item }) => item),
      history,
      firstPlan.releaseState,
      described
    );
    expect(preview.releaseState).toEqual(plan.releaseState);
    expect(JSON.stringify(described)).toBe(beforePreview);
    expect(plan.toDelete).not.toContain(mediaPath);
    expect(plan.releaseState?.current.hashes[mediaPath]).toBe(hash);
    expect(plan.releaseState?.current.data["article:1"].dependencies).toContain(mediaPath);
    expect(
      planPublication(second.files, []).releaseState?.current.hashes[mediaPath]
    ).toBeUndefined();
    const retry = planPublication(second.files, [{ filePath: mediaPath, contentHash: hash }], {
      version: 1,
      current: describeRelease([]),
      published: {},
      pending: { [mediaPath]: hash },
    });
    expect(retry.toDelete).not.toContain(mediaPath);
    expect(retry.releaseState?.current.hashes[mediaPath]).toBe(hash);

    let state = plan.releaseState;
    for (let round = 0; round < 3; round++) {
      if (!state) throw new Error("发布状态缺失");
      fixture.articles[2].title = `无关文章第 ${round + 1} 次更新`;
      const result = await generator().generate(fixture.data, fixture.selections, site);
      const next = planPublication(result.files, historyOf(state.published), state);
      expect(next.toDelete).not.toContain(mediaPath);
      expect(next.releaseState?.published[mediaPath]).toBe(hash);
      state = next.releaseState;
    }
    if (!state) throw new Error("发布状态缺失");
    const selections = fixture.selections.filter(
      item => item.contentType !== "article" || item.contentId !== 1
    );
    const shared = await generator().generate(fixture.data, selections, site);
    const sharedPlan = planPublication(shared.files, historyOf(state.published), state);
    expect(sharedPlan.toDelete).not.toContain(mediaPath);
    if (!sharedPlan.releaseState) throw new Error("发布状态缺失");
    fixture.articles[1].content = [
      { type: "paragraph", children: [{ type: "formatted", text: "已移除最后一张图片" }] },
    ];
    const removed = await generator().generate(fixture.data, selections, site);
    const removedPlan = planPublication(
      removed.files,
      historyOf(sharedPlan.releaseState.published),
      sharedPlan.releaseState
    );
    expect(removedPlan.toDelete).not.toContain(mediaPath);
    if (!removedPlan.releaseState) throw new Error("发布状态缺失");
    fixture.articles[2].title = "图片保留窗口结束";
    const expired = await generator().generate(fixture.data, selections, site);
    expect(
      planPublication(
        expired.files,
        historyOf(removedPlan.releaseState.published),
        removedPlan.releaseState
      ).toDelete
    ).toContain(mediaPath);
    const withdrawn = await generator().generate(
      fixture.data,
      selections.filter(item => item.contentType !== "article" || item.contentId !== 2),
      site
    );
    expect(
      planPublication(
        withdrawn.files,
        historyOf(sharedPlan.releaseState.published),
        sharedPlan.releaseState
      ).toDelete
    ).toContain(mediaPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("含百分号的原始文件优先读取，编码路径安全回退，缺失图片仍仅警告且不改正文", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tau-publish-percent-images-"));
  try {
    const percent = path.join(directory, "100%完成.png");
    const literal = path.join(directory, "literal%20space.png");
    const spaced = path.join(directory, "literal space.png");
    const encoded = path.join(directory, "编码 图片.png");
    await writeFile(percent, "百分号原图");
    await writeFile(literal, "字面百分号文件");
    await writeFile(spaced, "不能误读的空格文件");
    await writeFile(encoded, "编码路径图片");
    const urls = [
      percent,
      pathToFileURL(percent).href,
      literal,
      encodeURI(encoded),
      `ltoh:///${percent}`,
      `ltoh:///${encodeURIComponent(encoded).replace(/%2F/g, "/")}`,
      path.join(directory, "missing%图片.png"),
    ];
    const fixture = makePublishFixture();
    fixture.articles[0].content = deepFreeze(
      urls.map(url => ({
        type: "image" as const,
        url,
        children: [{ type: "formatted" as const, text: "" }],
      }))
    );
    const before = JSON.stringify(fixture.articles[0].content);
    const result = await generator().generate(fixture.data, fixture.selections, site);
    expect(JSON.stringify(fixture.articles[0].content)).toBe(before);
    const media = result.files.filter(item => item.path.startsWith("_tau/media/"));
    expect(media.map(item => item.content.toString()).sort()).toEqual(
      ["百分号原图", "字面百分号文件", "编码路径图片"].sort()
    );
    expect(result.imageWarnings).toHaveLength(1);
    expect(result.imageWarnings[0]).toMatchObject({
      url: urls[6],
      reason: "本地图片不存在，可能已移动或删除",
    });
    expect(result.files.some(item => item.publicationEntry)).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
