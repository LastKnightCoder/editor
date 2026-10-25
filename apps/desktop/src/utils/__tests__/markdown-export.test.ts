import { Blob as NodeBlob } from "node:buffer";
import { TextWriter, Uint8ArrayReader, ZipReader, configure as configureZip } from "@zip.js/zip.js";
import type { Descendant } from "slate";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMarkdownZipBytes, type BatchExportTreeNode } from "../batch-export";
import { toPortableMarkdown } from "../content-transfer/bundle";
import { EProjectItemType } from "@/types";

const mocks = vi.hoisted(() => ({
  getProjectList: vi.fn(),
  getArticlePage: vi.fn(),
  findOneArticle: vi.fn(),
  getScopedCards: vi.fn(),
  loadScopeTree: vi.fn(),
  readBinaryFile: vi.fn(),
  resolveLocalMediaPath: vi.fn(),
}));

vi.mock("@/commands/file", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/file")>()),
  readBinaryFile: mocks.readBinaryFile,
}));
vi.mock("@/utils/localMediaPath", () => ({
  resolveLocalMediaPath: mocks.resolveLocalMediaPath,
  getMediaMimeType: () => "image/png",
}));
vi.mock("@/commands/project", () => ({ getProjectList: mocks.getProjectList }));
vi.mock("@/commands/article", () => ({
  getArticlePage: mocks.getArticlePage,
  findOneArticle: mocks.findOneArticle,
}));
vi.mock("@/commands/card", () => ({ getScopedCards: mocks.getScopedCards }));
vi.mock("@/commands", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands")>()),
  saveFileWithDialog: vi.fn(),
  showInFolder: vi.fn(),
}));
vi.mock("@/utils/resouce", () => ({ remoteResourceToLocal: vi.fn() }));
vi.mock("@/utils/batch-export", async importOriginal => ({
  ...(await importOriginal<typeof import("../batch-export")>()),
  loadScopeTree: mocks.loadScopeTree,
}));

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", children });
const image = (url: string) => ({ type: "image", url, alt: "", children: [text("")] });
const link = (kind: string, refId: number, title: string) => ({
  type: "content-link",
  refId,
  contentId: refId,
  contentType: kind,
  contentTitle: title,
  children: [text(title)],
});

const doc = (
  id: number,
  title: string,
  content: unknown[],
  extra: Partial<BatchExportTreeNode> = {}
): BatchExportTreeNode => ({
  id,
  title,
  depth: 0,
  itemType: EProjectItemType.Document,
  exportable: true,
  content: content as Descendant[],
  children: [],
  ...extra,
});

const group = (id: number, title: string, children: BatchExportTreeNode[]) =>
  doc(id, title, [], { exportable: false, children });

const unzip = async (bytes: Uint8Array) => {
  configureZip({ useWebWorkers: false });
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const files: Record<string, string> = {};
  for (const entry of await reader.getEntries()) {
    if (!entry.directory) files[entry.filename] = await entry.getData(new TextWriter());
  }
  await reader.close();
  return files;
};

beforeAll(() => vi.stubGlobal("Blob", NodeBlob));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.resolveLocalMediaPath.mockImplementation(async (raw: string) => raw);
  mocks.readBinaryFile.mockResolvedValue(new Uint8Array([1]));
});

describe("互链写法", () => {
  const content = [paragraph(text("见 "), link("card", 2, "另一张"))] as Descendant[];
  const base = { assets: new Map<string, string>(), dir: ["卡片"] };
  const resolveLink = () => ["卡片", "另一张.md"];

  it("wiki：[[文件名]]，显示文字不同时带别名，文件名重复时写包内路径", () => {
    expect(toPortableMarkdown(content, { ...base, resolveLink, linkStyle: "wiki" })).toContain(
      "[[另一张]]"
    );
    const aliased = [paragraph(link("card", 2, "显示 | 文字"))] as Descendant[];
    expect(toPortableMarkdown(aliased, { ...base, resolveLink, linkStyle: "wiki" })).toContain(
      "[[另一张|显示   文字]]"
    );
    expect(
      toPortableMarkdown(content, {
        ...base,
        resolveLink,
        linkStyle: "wiki",
        isUniqueStem: () => false,
      })
    ).toContain("[[卡片/另一张]]");
  });

  it("text：一律只留标题；relative：相对 .md", () => {
    const plain = toPortableMarkdown(content, { ...base, resolveLink, linkStyle: "text" });
    expect(plain).toContain("见 另一张");
    expect(plain).not.toContain("](");
    expect(toPortableMarkdown(content, { ...base, resolveLink })).toContain("[另一张](另一张.md)");
  });
});

describe("Markdown 包", () => {
  it("跨范围互链、frontmatter、按需加载正文、保留原地址", async () => {
    const loadContent = vi.fn(async () => [paragraph(text("文章正文"))] as Descendant[]);
    const tree = [
      group(1, "文章", [
        doc(2, "原则", [], {
          ref: { kind: "article", id: 20 },
          loadContent,
          meta: {
            tags: ["读书"],
            createTime: Date.UTC(2024, 0, 2),
            updateTime: Date.UTC(2024, 1, 3),
          },
        }),
      ]),
      group(3, "卡片", [
        doc(4, "摘记", [paragraph(link("article", 20, "原则")), image("~/a.png")], {
          ref: { kind: "card", id: 40 },
        }),
      ]),
    ];

    const { bytes, fileCount, assetCount } = await buildMarkdownZipBytes(
      tree,
      new Set([2, 4]),
      undefined,
      { linkStyle: "wiki", frontmatter: true, assets: "keep" }
    );
    const files = await unzip(bytes);
    expect(Object.keys(files).sort()).toEqual(["卡片/摘记.md", "文章/原则.md"]);
    expect([fileCount, assetCount]).toEqual([2, 0]);
    expect(loadContent).toHaveBeenCalledTimes(1);
    expect(files["文章/原则.md"]).toBe(
      "---\ntitle: 原则\ntags:\n  - 读书\ncreated: 2024-01-02T00:00:00.000Z\nupdated: 2024-02-03T00:00:00.000Z\n---\n\n文章正文\n"
    );
    expect(files["卡片/摘记.md"]).toContain("[[原则]]");
    // keep：不读资源，地址原样
    expect(files["卡片/摘记.md"]).toContain("![](~/a.png)");
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it("远程图片：传 fetchRemote 才打包", async () => {
    const tree = [doc(1, "a", [image("https://cdn.x/p.png")])];
    const without = await unzip((await buildMarkdownZipBytes(tree, new Set([1]))).bytes);
    expect(Object.keys(without)).toEqual(["a.md"]);

    const fetchRemote = vi.fn(async () => "/cache/p.png");
    const withRemote = await buildMarkdownZipBytes(tree, new Set([1]), undefined, { fetchRemote });
    const files = await unzip(withRemote.bytes);
    expect(fetchRemote).toHaveBeenCalledWith("https://cdn.x/p.png");
    expect(Object.keys(files).sort()).toEqual(["a.md", "assets/p.png"]);
    expect(files["a.md"]).toContain("![](assets/p.png)");
  });
});

describe("导出范围", () => {
  it("文章按首个标签逐级分文件夹，正文按需加载；卡片同理；全部分三组", async () => {
    const { loadExportCatalog, groupByFirstTag } = await import("@/services/markdown-export");
    mocks.getArticlePage.mockResolvedValue({
      items: [
        {
          id: 1,
          contentId: 11,
          title: "A",
          tags: ["读书/方法", "x"],
          words: 10,
          createTime: 1,
          updateTime: 2,
        },
        { id: 2, title: "", tags: [], words: 0, createTime: 1, updateTime: 2 },
      ],
      total: 2,
    });
    mocks.findOneArticle.mockResolvedValue({ content: [paragraph(text("A 正文"))] });
    mocks.getScopedCards.mockResolvedValue([
      {
        id: 9,
        tags: ["卡"],
        content: [paragraph(text("卡片正文"))],
        count: 4,
        create_time: 1,
        update_time: 2,
      },
    ]);
    mocks.getProjectList.mockResolvedValue([
      { id: 5, title: "P", archived: false },
      { id: 6, title: "归档", archived: true },
    ]);
    mocks.loadScopeTree.mockResolvedValue([doc(100, "项目文档", [paragraph(text("p"))])]);

    const shape = (nodes: BatchExportTreeNode[]): unknown =>
      nodes.map(node => (node.exportable ? node.title : [node.title, shape(node.children)]));

    const articles = await loadExportCatalog("article", "db");
    expect(shape(articles.tree)).toEqual([["读书", [["方法", ["A"]]]], "未命名文章 #2"]);
    const first = articles.tree[0].children[0].children[0];
    expect(first.ref).toEqual({ kind: "article", id: 1 });
    expect(first.contentId).toBe(11);
    expect(mocks.findOneArticle).not.toHaveBeenCalled();
    expect(articles.tree[1].empty).toBe(true);

    const all = await loadExportCatalog("all", "db");
    expect(shape(all.tree)).toEqual([
      ["项目", [["P", ["项目文档"]]]],
      ["文章", [["读书", [["方法", ["A"]]]], "未命名文章 #2"]],
      ["卡片", [["卡", ["卡片正文"]]]],
    ]);
    const projectNode = all.tree[0].children[0];
    expect(all.projectNodes.get(projectNode.id)).toBe(5);
    expect(projectNode.children[0].ref).toEqual({ kind: "project-item", id: 100 });
    // 临时编号全局唯一
    const ids: number[] = [];
    const walk = (nodes: BatchExportTreeNode[]) =>
      nodes.forEach(node => {
        ids.push(node.id);
        walk(node.children);
      });
    walk(all.tree);
    expect(new Set(ids).size).toBe(ids.length);

    let next = 1;
    expect(groupByFirstTag(() => next++, [])).toEqual([]);
  });
});
