import { Blob as NodeBlob } from "node:buffer";
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
  configure as configureZip,
} from "@zip.js/zip.js";
import type { Descendant } from "slate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  readFrontmatter,
  runImport,
  scanImportSource,
  summarizePlan,
  type ImportDeps,
  type ScanDeps,
} from "../content-transfer/batch-import";
import {
  normalizeRelativePath,
  openFolderSource,
  openZipSource,
  type TransferSource,
} from "../content-transfer/source";

vi.mock("@/commands/file", () => ({
  readBinaryFile: vi.fn(),
  readTextFile: vi.fn(),
  readDirectory: vi.fn(),
  getDirectoryName: vi.fn(),
  getFileBaseName: vi.fn(),
  getHomeDir: vi.fn(),
  resolvePathFrom: vi.fn(),
}));
vi.mock("@/utils/localMediaPath", () => ({
  resolveLocalMediaPath: vi.fn(),
  getMediaMimeType: () => "application/octet-stream",
}));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: vi.fn() }));

const encoder = new TextEncoder();

const memorySource = (files: Record<string, string>, kind: "folder" | "zip" = "folder") =>
  ({
    kind,
    name: "vault",
    rootPath: "/vault",
    files: Object.keys(files),
    markers: [],
    has: path => path in files,
    readBytes: async path => encoder.encode(files[path]),
    readText: async path => files[path],
  }) satisfies TransferSource;

const scanDeps = (existing: string[] = []): ScanDeps => ({
  pathExists: async path => existing.includes(path),
  getHomeDir: async () => "/home/me",
  resolvePathFrom: async (base, target) =>
    target.startsWith("/") ? target : `/${normalizeRelativePath(`${base}/${target}`)}`,
});

const fakeDeps = () => {
  let nextId = 1;
  const calls: string[] = [];
  const updates = new Map<number, Descendant[]>();
  const make = () => {
    const id = nextId++;
    return { id, contentId: id * 100 };
  };
  const deps: ImportDeps = {
    readDiskBytes: async path => encoder.encode(path),
    upload: async file => `~/.editor/resources/${file.name}`,
    createProject: async title => {
      calls.push(`project:${title}`);
      return 99;
    },
    addProjectItem: async ({ parentItemId, title, content }) => {
      const entity = make();
      calls.push(`item:${title}<${parentItemId ?? "root"}:${content.length}`);
      return entity;
    },
    createArticle: async ({ title, tags }) => {
      calls.push(`article:${title}[${tags.join(",")}]`);
      return make();
    },
    createCard: async ({ tags }) => {
      calls.push(`card[${tags.join(",")}]`);
      return make();
    },
    updateContent: async (contentId, content) => {
      updates.set(contentId, content);
    },
    createDatabase: async ({ title, headers, rows }) => {
      calls.push(`database:${title}[${headers.join(",")}]x${rows.length}`);
      return 500;
    },
  };
  return { deps, calls, updates };
};

const findNode = (content: unknown, type: string): Record<string, unknown> | undefined => {
  if (!content || typeof content !== "object") return undefined;
  if (Array.isArray(content)) {
    for (const node of content) {
      const hit = findNode(node, type);
      if (hit) return hit;
    }
    return undefined;
  }
  const record = content as Record<string, unknown>;
  if (record.type === type) return record;
  return findNode(record.children, type);
};

describe("来源", () => {
  beforeAll(() => vi.stubGlobal("Blob", NodeBlob));
  afterAll(() => vi.unstubAllGlobals());

  it("相对路径规范化，越出根目录为 null", () => {
    expect(normalizeRelativePath("a/./b/../c.md")).toBe("a/c.md");
    expect(normalizeRelativePath("a\\b.md")).toBe("a/b.md");
    expect(normalizeRelativePath("../x.md")).toBeNull();
  });

  it("文件夹递归读取，跳过隐藏目录与 node_modules", async () => {
    const tree: Record<string, Array<{ name: string; isDirectory: boolean }>> = {
      "/v": [
        { name: "a.md", isDirectory: false },
        { name: ".obsidian", isDirectory: true },
        { name: "node_modules", isDirectory: true },
        { name: "sub", isDirectory: true },
      ],
      "/v/sub": [
        { name: "b.md", isDirectory: false },
        { name: ".DS_Store", isDirectory: false },
      ],
    };
    const source = await openFolderSource("/v", {
      readDirectory: async dir =>
        (tree[dir] ?? []).map(entry => ({ ...entry, path: `${dir}/${entry.name}` })),
      readBinaryFile: async path => encoder.encode(path),
      getFileBaseName: async () => "v",
    });
    expect(source.files).toEqual(["a.md", "sub/b.md"]);
    expect(await source.readText("sub/b.md")).toBe("/v/sub/b.md");
  });

  it("压缩包剥掉唯一的同名根目录，忽略 __MACOSX", async () => {
    configureZip({ useWebWorkers: false });
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add("笔记/a.md", new TextReader("# A"));
    await writer.add("笔记/img/p.png", new Uint8ArrayReader(new Uint8Array([1])));
    await writer.add("__MACOSX/笔记/._a.md", new TextReader("x"));
    const bytes = await writer.close();
    const source = await openZipSource("/d/export.zip", {
      readDirectory: vi.fn(),
      readBinaryFile: async () => bytes,
      getFileBaseName: async () => "export.zip",
    });
    expect(source.name).toBe("笔记");
    expect(source.files.sort()).toEqual(["a.md", "img/p.png"]);
    expect(await source.readText("a.md")).toBe("# A");
  });
});

describe("扫描", () => {
  it("frontmatter 读取 tags 与 title", () => {
    expect(readFrontmatter("---\ntags: [读书, '#方法']\ntitle: 原则\n---\n正文")).toEqual({
      tags: ["读书", "方法"],
      title: "原则",
    });
    expect(readFrontmatter("---\ntags: a, b\n---\n").tags).toEqual(["a", "b"]);
    expect(readFrontmatter("没有 frontmatter").tags).toEqual([]);
  });

  it("资源按 .md 所在目录解析并去重，缺失与越界单列；文档互链解析", async () => {
    const source = memorySource({
      "读书/原则.md":
        "![](img/radar.png)\n\n见 [反脆弱](反脆弱.md) 与 [缺失](不存在.md) 和 [外链](https://x.com)",
      "读书/反脆弱.md": "![](./img/radar.png)\n\n![](../outside.png)\n\n![](gone.png)",
      "读书/img/radar.png": "png",
      "其它.txt": "x",
    });
    const plan = await scanImportSource(source, scanDeps(["/vault/outside.png"]));
    expect(plan.docs.map(doc => doc.path)).toEqual(["读书/反脆弱.md", "读书/原则.md"]);
    expect([...plan.assets.keys()].sort()).toEqual([
      "disk:/vault/outside.png",
      "source:读书/img/radar.png",
    ]);
    const principle = plan.docs.find(doc => doc.title === "原则")!;
    expect([...principle.links.values()]).toEqual([plan.docs.find(d => d.title === "反脆弱")!.key]);
    expect(principle.unresolvedLinks).toEqual(["不存在.md"]);
    expect(plan.docs.find(d => d.title === "反脆弱")!.missingAssets).toEqual(["gone.png"]);
    expect(plan.otherFileCount).toBe(1);

    const summary = summarizePlan(plan, new Set(plan.docs.map(doc => doc.key)));
    expect(summary).toMatchObject({
      docCount: 2,
      assetCount: 2,
      missingAssetCount: 1,
      linkCount: 1,
      unresolvedLinkCount: 1,
      issueDocCount: 2,
    });
  });

  it("同级 X.md 与 X/ 合并为带子级的文档节点，文件夹先于文档", async () => {
    const plan = await scanImportSource(
      memorySource({ "b.md": "b", "a.md": "a", "a/c.md": "c", "z/d.md": "d" }),
      scanDeps()
    );
    const shape = (nodes: typeof plan.tree): unknown =>
      nodes.map(node => [node.title, !!node.doc, shape(node.children)]);
    expect(shape(plan.tree)).toEqual([
      ["a", true, [["c", true, []]]],
      ["z", false, [["d", true, []]]],
      ["b", true, []],
    ]);
  });
});

describe("执行", () => {
  const vault = () =>
    memorySource({
      "读书/原则.md": "![](img/p.png)\n\n见 [另一篇](反脆弱.md)",
      "读书/反脆弱.md": "---\ntags: [方法]\n---\n![](img/p.png)",
      "读书/img/p.png": "png",
      "随笔.md": "随笔",
    });

  it("项目：建项目与文档树，资源只传一次，链接回填为 content-link 并保留原文字", async () => {
    const plan = await scanImportSource(vault(), scanDeps());
    const { deps, calls, updates } = fakeDeps();
    const upload = vi.spyOn(deps, "upload");
    const result = await runImport(
      plan,
      {
        target: "project",
        projectTitle: "我的库",
        selected: new Set(plan.docs.map(doc => doc.key)),
        useSourceTags: true,
        importTables: false,
      },
      deps
    );
    expect(result.stopped).toBeUndefined();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "project:我的库",
      "item:读书<root:0",
      "item:反脆弱<1:1",
      "item:原则<1:2",
      "item:随笔<root:1",
    ]);
    expect(result).toMatchObject({ projectId: 99, docCount: 3, assetCount: 1, linkCount: 1 });

    const principleContentId = 300; // 第 3 个建出的实体
    const link = findNode(updates.get(principleContentId), "content-link");
    expect(link).toMatchObject({
      refId: 2,
      contentId: 200,
      contentType: "project-item",
      contentTitle: "反脆弱",
      children: [{ type: "formatted", text: "另一篇" }],
    });
    expect(findNode(updates.get(principleContentId), "image")).toMatchObject({
      url: "~/.editor/resources/p.png",
    });
  });

  it("文章：顶层文件夹 + frontmatter 为标签；只导选中，指向未选中文档的链接不回填", async () => {
    const plan = await scanImportSource(vault(), scanDeps());
    const principle = plan.docs.find(doc => doc.title === "原则")!;
    const essay = plan.docs.find(doc => doc.title === "随笔")!;
    const { deps, calls, updates } = fakeDeps();
    const result = await runImport(
      plan,
      {
        target: "article",
        projectTitle: "",
        selected: new Set([principle.key, essay.key]),
        useSourceTags: true,
        importTables: false,
      },
      deps
    );
    expect(calls).toEqual(["article:原则[读书]", "article:随笔[]"]);
    expect(result.entityIds).toEqual([1, 2]);
    expect(result.linkCount).toBe(0);
    expect(updates.size).toBe(0);
  });

  it("卡片：完整文件夹路径作层级标签，关闭 frontmatter 标签", async () => {
    const plan = await scanImportSource(
      memorySource({ "a/b/c.md": "---\ntags: x\n---\nc" }),
      scanDeps()
    );
    const { deps, calls } = fakeDeps();
    await runImport(
      plan,
      {
        target: "card",
        projectTitle: "",
        selected: new Set([0]),
        useSourceTags: false,
        importTables: false,
      },
      deps
    );
    expect(calls).toEqual(["card[a/b]"]);
  });

  it("停止或写库前检查失败时保留已写入部分，标记中断", async () => {
    const plan = await scanImportSource(vault(), scanDeps());
    const { deps } = fakeDeps();
    let writes = 0;
    const result = await runImport(
      plan,
      {
        target: "card",
        projectTitle: "",
        selected: new Set(plan.docs.map(d => d.key)),
        useSourceTags: false,
        importTables: false,
      },
      deps,
      {
        beforeWrite: () => {
          writes += 1;
          if (writes > 1) throw new Error("数据库已切换");
        },
      }
    );
    expect(result).toMatchObject({ stopped: "failed", error: "数据库已切换", entityIds: [1] });

    const controller = new AbortController();
    controller.abort();
    const canceled = await runImport(
      plan,
      {
        target: "card",
        projectTitle: "",
        selected: new Set([0]),
        useSourceTags: false,
        importTables: false,
      },
      fakeDeps().deps,
      { signal: controller.signal }
    );
    expect(canceled.stopped).toBe("canceled");
    expect(canceled.entityIds).toEqual([]);
  });

  it("资源上传失败记警告，正文保留原地址", async () => {
    const plan = await scanImportSource(
      memorySource({ "a.md": "![](p.png)", "p.png": "x" }),
      scanDeps()
    );
    const { deps } = fakeDeps();
    deps.upload = async () => null;
    const result = await runImport(
      plan,
      {
        target: "card",
        projectTitle: "",
        selected: new Set([0]),
        useSourceTags: false,
        importTables: false,
      },
      deps
    );
    expect(result.assetCount).toBe(0);
    expect(result.warnings[0]).toContain("上传失败");
  });
});
