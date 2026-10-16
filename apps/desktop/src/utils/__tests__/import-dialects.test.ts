import type { Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";
import {
  runImport,
  scanImportSource,
  type ImportDeps,
  type ScanDeps,
} from "../content-transfer/batch-import";
import { parseCsv } from "../content-transfer/csv";
import {
  collectInlineTags,
  convertCallouts,
  createNameResolver,
  detectDialect,
  logseqJournalNames,
  logseqPageName,
  mapOutsideCode,
  stripNotionId,
} from "../content-transfer/dialects";
import { normalizeRelativePath, type TransferSource } from "../content-transfer/source";

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

const source = (files: Record<string, string>, markers: string[] = []): TransferSource => ({
  kind: "folder",
  name: "vault",
  rootPath: "/vault",
  files: Object.keys(files),
  markers,
  has: path => path in files,
  readBytes: async path => encoder.encode(files[path]),
  readText: async path => files[path],
});

const scanDeps: ScanDeps = {
  pathExists: async () => false,
  getHomeDir: async () => "/home/me",
  resolvePathFrom: async (base, target) => `/${normalizeRelativePath(`${base}/${target}`)}`,
};

const find = (content: unknown, type: string): Array<Record<string, unknown>> => {
  if (!content || typeof content !== "object") return [];
  if (Array.isArray(content)) return content.flatMap(node => find(node, type));
  const record = content as Record<string, unknown>;
  return [...(record.type === type ? [record] : []), ...find(record.children, type)];
};

const textOf = (content: unknown): string => {
  if (!content || typeof content !== "object") return "";
  if (Array.isArray(content)) return content.map(textOf).join("");
  const record = content as { text?: string; children?: unknown };
  return typeof record.text === "string" ? record.text : textOf(record.children);
};

const docByTitle = async (files: Record<string, string>, markers: string[] = []) => {
  const plan = await scanImportSource(source(files, markers), scanDeps);
  return { plan, doc: (title: string) => plan.docs.find(doc => doc.title === title)! };
};

describe("文本工具", () => {
  it("只改写代码之外的文本", () => {
    const markdown = "a [[x]] `[[y]]`\n```\n[[z]]\n```\n[[w]]";
    expect(mapOutsideCode(markdown, text => text.replace(/\[\[(\w)\]\]/g, "<$1>"))).toBe(
      "a <x> `[[y]]`\n```\n[[z]]\n```\n<w>"
    );
  });

  it("callout / GitHub alert 转 callout directive，未知类型按 note", () => {
    expect(convertCallouts("> [!warning]- 小心\n> 第一行\n> 第二行\n正文")).toBe(
      ':::warning{title="小心"}\n第一行\n第二行\n:::\n正文'
    );
    expect(convertCallouts("> [!NOTE]\n> 说明")).toBe(":::note\n说明\n:::");
    expect(convertCallouts("> [!whatever] T\n> x")).toBe(':::note{title="T"}\nx\n:::');
    expect(convertCallouts("> 普通引用")).toBe("> 普通引用");
  });

  it("行内 #标签：排除纯数字、标题与代码", () => {
    expect(collectInlineTags("# 标题\n读到 #方法/学习 和 #1 号，`#code`，(#括号)")).toEqual([
      "方法/学习",
      "括号",
    ]);
  });

  it("名称解析：大小写不敏感，重名优先同目录再取最短路径", () => {
    const resolve = createNameResolver(["a/Note.md", "b/c/note.md", "Other.md"], path =>
      path.replace(/\.md$/, "")
    );
    expect(resolve("note", "a/x.md")).toBe("a/Note.md");
    expect(resolve("note", "b/c/y.md")).toBe("b/c/note.md");
    expect(resolve("NOTE", "z.md")).toBe("a/Note.md");
    expect(resolve("c/note", "z.md")).toBe("b/c/note.md");
    expect(resolve("missing", "z.md")).toBeNull();
  });

  it("CSV：引号、转义、换行、BOM 与不齐的行", () => {
    expect(parseCsv('﻿名称,备注\r\n"a,b","说""明"\n"多\n行",\n,\nc')).toEqual({
      headers: ["名称", "备注"],
      rows: [
        ["a,b", '说"明'],
        ["多\n行", ""],
        ["c", ""],
      ],
    });
  });
});

describe("识别", () => {
  it("Logseq 配置 > .obsidian > Notion id > 通用", () => {
    expect(detectDialect(source({ "logseq/config.edn": "", "pages/a.md": "" }))).toBe("logseq");
    expect(detectDialect(source({ "a.md": "" }, [".obsidian"]))).toBe("obsidian");
    expect(
      detectDialect(source({ "Home 0123456789abcdef0123456789abcdef.md": "", "x.md": "" }))
    ).toBe("notion");
    expect(detectDialect(source({ "a.md": "" }))).toBe("generic");
  });
});

describe("Obsidian", () => {
  const vault = {
    "笔记/原则.md":
      "---\ntags: [读书]\n---\n见 [[反脆弱|那本书]]、[[反脆弱#第一章]] 和 [[不存在的笔记]]\n\n![[radar.png|300]]\n\n![[录音.m4a]]\n\n==重点== #方法 %%私下的批注%%\n\n> [!tip] 提示\n> 内容\n\n段落 ^abc123\n\n`[[代码里]]`",
    "笔记/反脆弱.md": "正文",
    "附件/radar.png": "png",
    "附件/录音.m4a": "m4a",
  };

  it("维基链接、嵌入、高亮、callout、注释与块标识", async () => {
    const { doc } = await docByTitle(vault, [".obsidian"]);
    const principle = doc("原则");
    const antifragile = doc("反脆弱");

    // 两个 [[反脆弱]] 都解析到文档，链接文字保留别名
    expect([...new Set(principle.links.values())]).toEqual([antifragile.key]);
    const links = find(principle.content, "link");
    expect(links.map(textOf)).toEqual(["那本书", "反脆弱"]);
    expect(principle.unresolvedLinks).toEqual(["不存在的笔记"]);
    expect(textOf(principle.content)).toContain("不存在的笔记");

    // 附件按文件名跨目录定位
    expect(find(principle.content, "image")[0]).toMatchObject({ url: "../附件/radar.png" });
    expect(find(principle.content, "audio")[0]).toMatchObject({ src: "../附件/录音.m4a" });
    expect([...principle.assets.values()].sort()).toEqual([
      "source:附件/radar.png",
      "source:附件/录音.m4a",
    ]);

    const text = textOf(principle.content);
    expect(text).not.toContain("私下的批注");
    expect(text).not.toContain("^abc123");
    expect(text).toContain("[[代码里]]");
    expect(find(principle.content, "callout")[0]).toMatchObject({
      calloutType: "tip",
      title: "提示",
    });
    expect(JSON.stringify(principle.content)).toContain('"highlight"');
    expect(principle.sourceTags.sort()).toEqual(["方法", "读书"]);
  });

  it("执行后维基链接回填为应用内链接", async () => {
    const plan = await scanImportSource(source(vault, [".obsidian"]), scanDeps);
    const updates = new Map<number, Descendant[]>();
    let id = 0;
    const deps: ImportDeps = {
      readDiskBytes: vi.fn(),
      upload: async file => `~/r/${file.name}`,
      createProject: vi.fn(),
      addProjectItem: vi.fn(),
      createArticle: async () => ({ id: ++id, contentId: id * 10 }),
      createCard: vi.fn(),
      updateContent: async (contentId, content) => void updates.set(contentId, content),
      createDatabase: vi.fn(),
    };
    const result = await runImport(
      plan,
      {
        target: "article",
        projectTitle: "",
        selected: new Set(plan.docs.map(doc => doc.key)),
        useSourceTags: true,
        importTables: false,
      },
      deps
    );
    expect(result.linkCount).toBe(2);
    const principleContent = [...updates.values()][0];
    expect(find(principleContent, "content-link").map(link => link.contentTitle)).toEqual([
      "反脆弱",
      "反脆弱",
    ]);
    expect(result.warnings.some(warning => warning.includes("不存在的笔记"))).toBe(true);
  });
});

describe("Notion", () => {
  const id = (n: number) => String(n).repeat(32).slice(0, 32);
  const files = {
    [`工作区 ${id(1)}.md`]: `# 工作区\n\nTags: 规划, 季度\n\n见 [周报](%E5%B7%A5%E4%BD%9C%E5%8C%BA%20${id(1)}/%E5%91%A8%E6%8A%A5%20${id(2)}.md)\n\n![](%E5%B7%A5%E4%BD%9C%E5%8C%BA%20${id(1)}/chart.png)`,
    [`工作区 ${id(1)}/周报 ${id(2)}.md`]: "# 周报\n\n内容",
    [`工作区 ${id(1)}/chart.png`]: "png",
    [`工作区 ${id(1)}/任务 ${id(3)}.csv`]: "名称,状态\n写周报,完成",
    [`工作区 ${id(1)}/任务 ${id(3)}_all.csv`]: "名称,状态\n写周报,完成\n复盘,进行中",
  };

  it("去掉 id 与重复标题，Tags 行转标签，链接与图片照常解析，CSV 取 _all", async () => {
    const { plan, doc } = await docByTitle(files);
    expect(plan.dialect).toBe("notion");
    const home = doc("工作区");
    expect(home.sourceTags).toEqual(["规划", "季度"]);
    expect(find(home.content, "header")).toHaveLength(0);
    expect([...home.links.values()]).toEqual([doc("周报").key]);
    expect([...home.assets.values()]).toEqual([`source:工作区 ${id(1)}/chart.png`]);

    // 页面与同名子目录合并，子页面挂在其下
    expect(plan.tree.map(node => [node.title, node.children.map(child => child.title)])).toEqual([
      ["工作区", ["周报"]],
    ]);

    expect(plan.tables).toEqual([
      {
        path: `工作区 ${id(1)}/任务 ${id(3)}_all.csv`,
        title: "任务",
        headers: ["名称", "状态"],
        rows: [
          ["写周报", "完成"],
          ["复盘", "进行中"],
        ],
      },
    ]);
    expect(stripNotionId(`a b ${id(4)}.md`)).toBe("a b.md");
  });

  it("勾选导入表格时建数据库，结果记 id", async () => {
    const plan = await scanImportSource(source(files), scanDeps);
    const createDatabase = vi.fn(async () => 77);
    const result = await runImport(
      plan,
      {
        target: "card",
        projectTitle: "",
        selected: new Set(),
        useSourceTags: false,
        importTables: true,
      },
      {
        readDiskBytes: vi.fn(),
        upload: vi.fn(),
        createProject: vi.fn(),
        addProjectItem: vi.fn(),
        createArticle: vi.fn(),
        createCard: vi.fn(),
        updateContent: vi.fn(),
        createDatabase,
      }
    );
    expect(createDatabase).toHaveBeenCalledWith({
      title: "任务",
      headers: ["名称", "状态"],
      rows: [
        ["写周报", "完成"],
        ["复盘", "进行中"],
      ],
    });
    expect(result.databaseIds).toEqual([77]);
  });

  it("压缩包里只有压缩包时提示先解压外层", async () => {
    await expect(scanImportSource(source({ "Part-1.zip": "" }), scanDeps)).rejects.toThrow(
      "请先解压外层"
    );
  });
});

describe("Logseq", () => {
  const graph = {
    "logseq/config.edn": "{}",
    "logseq/bak/pages/旧.md": "备份",
    "pages/读书___原则.md":
      "title:: 读书/原则\ntags:: 方法, [[阅读]]\n\n- 第一条 [[反脆弱]]\n  id:: 6512bd43-d9ca-4fd4-8d1e-7a4f00000000\n- TODO 写读后感\n- DONE 读完\n- 引用 ((6512bd43-d9ca-4fd4-8d1e-7a4f00000000))\n- [见日志]([[Jan 15th, 2024]]) #[[深度 工作]] ^^重点^^\n- ![图](../assets/p.png)",
    "pages/反脆弱.md": "- 正文",
    "journals/2024_01_15.md": "- 今天",
    "assets/p.png": "png",
  };

  it("页面名、日志日期、属性、任务、块引用与配置目录", async () => {
    const { plan, doc } = await docByTitle(graph);
    expect(plan.dialect).toBe("logseq");
    expect(plan.docs.map(d => d.path)).not.toContain("logseq/bak/pages/旧.md");

    const principle = doc("读书/原则");
    expect(principle.sourceTags.sort()).toEqual(["深度-工作", "方法", "阅读"].sort());
    const journal = plan.docs.find(d => d.path === "journals/2024_01_15.md")!;
    expect(new Set(principle.links.values())).toEqual(new Set([doc("反脆弱").key, journal.key]));
    expect(find(principle.content, "link").map(textOf)).toEqual(["反脆弱", "见日志"]);
    expect(principle.notes).toEqual(["1 处块引用 ((…)) 无法保留，已移除"]);
    expect([...principle.assets.values()]).toEqual(["source:assets/p.png"]);

    const text = JSON.stringify(principle.content);
    expect(text).not.toContain("id::");
    expect(text).not.toContain("title::");
    expect(text).not.toContain("TODO");
    expect(
      find(principle.content, "check-list-item").map(item => [textOf(item), item.checked])
    ).toEqual([
      ["写读后感", false],
      ["读完", true],
    ]);
    expect(text).toContain('"highlight"');

    // pages/ 摊平到根，journals/ 显示为「日志」
    expect(plan.tree.map(node => node.title)).toEqual(
      ["日志", "读书/原则", "反脆弱"].sort((a, b) =>
        a === "日志" ? -1 : b === "日志" ? 1 : a.localeCompare(b, "zh-CN")
      )
    );
  });

  it("页面文件名与日志引用名", () => {
    expect(logseqPageName("pages/a___b.md")).toBe("a/b");
    expect(logseqPageName("pages/a%2Fb.md")).toBe("a/b");
    expect(logseqJournalNames("journals/2024_01_02.md")).toContain("Jan 2nd, 2024");
    expect(logseqJournalNames("journals/2024_03_11.md")).toContain("Mar 11th, 2024");
    expect(logseqJournalNames("journals/2024_03_23.md")).toContain("2024-03-23");
  });
});
