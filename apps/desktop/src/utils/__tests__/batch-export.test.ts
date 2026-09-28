import { Blob as NodeBlob } from "node:buffer";
import { Uint8ArrayReader, ZipReader, configure as configureZip } from "@zip.js/zip.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildBatchEpubPayload,
  buildBatchPdfPayload,
  buildMarkdownZipBytes,
  buildMergedMarkdown,
  flattenSelectedChapters,
  type BatchExportTreeNode,
} from "../batch-export";
import type { BatchExportChapter, BatchExportRule } from "@/types";

vi.mock("@/utils/html-serializers", () => ({
  htmlSerializerRegistry: {
    serializeAsync: vi.fn(async () => "<p>正文</p>"),
  },
}));

vi.mock("@/utils/markdown", () => ({
  getMarkdown: vi.fn(() => "正文"),
}));

vi.mock("@/utils/epub-export/assets", () => ({
  processEpubAssets: vi.fn(async ({ chapters }: { chapters: unknown[] }) => ({
    chapters,
    assets: [],
    coverImageSrc: undefined,
  })),
}));

const createNode = (
  input: Partial<BatchExportTreeNode> & Pick<BatchExportTreeNode, "id" | "title" | "exportable">
): BatchExportTreeNode => ({
  depth: 0,
  content: input.exportable
    ? [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: input.title }],
        },
      ]
    : [],
  children: [],
  ...input,
});

describe("batch export markdown zip", () => {
  beforeAll(() => {
    vi.stubGlobal("Blob", NodeBlob);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("导出未勾选的空内容目录下已选中的后代文档", async () => {
    const tree = [
      createNode({
        id: 1,
        title: "空内容目录",
        exportable: false,
        children: [
          createNode({
            id: 2,
            title: "下级文档",
            exportable: true,
          }),
        ],
      }),
    ];

    const zipBytes = await buildMarkdownZipBytes(tree, new Set([2]));
    configureZip({ useWebWorkers: false });
    const zipReader = new ZipReader(new Uint8ArrayReader(zipBytes));
    const entries = await zipReader.getEntries();
    await zipReader.close();

    expect(entries.map(entry => entry.filename)).toEqual(["空内容目录/下级文档.md"]);
  });
});

const pdfChapters: BatchExportChapter[] = [
  { id: 1, title: "第一章", depth: 0, content: [] },
  { id: 2, title: "1.1 小节", depth: 1, content: [] },
];

const pdfRule: BatchExportRule = {
  pageBreak: true,
  asHeading: true,
  headingLevel: 1,
};

describe("batch export pdf payload", () => {
  it("开启目录页时插入目录 section、锚点链接与书签大纲设置", async () => {
    const payload = await buildBatchPdfPayload({
      chapters: pdfChapters,
      title: "测试书",
      rule: pdfRule,
      pdf: { outline: true, tocPage: true },
    });

    expect(payload.html).toContain('<section class="pdf-toc">');
    expect(payload.html).toContain('href="#batch-chapter-0"');
    expect(payload.html).toContain('href="#batch-chapter-1"');
    expect(payload.html).toContain('id="batch-chapter-0"');
    expect(payload.html).toContain("第一章");
    expect(payload.html).toContain("1.1 小节");
    // 条目结构：文本 + 点线引导；顶层条目加粗；标题下带跳转提示
    expect(payload.html).toContain('class="pdf-toc-text"');
    expect(payload.html).toContain('class="pdf-toc-leader"');
    expect(payload.html).toContain('class="pdf-toc-item pdf-toc-item-top"');
    expect(payload.html).toContain("点击条目可跳转至对应章节");
    expect(payload.html.indexOf("pdf-toc")).toBeLessThan(
      payload.html.indexOf('id="batch-chapter-0"')
    );
    expect(payload.styles).toContain(".pdf-toc");
    expect(payload.styles).toContain(".pdf-toc-leader");
    expect(payload.options.generateOutline).toBe(true);
  });

  it("关闭目录页时不插入目录，但保留标题锚点", async () => {
    const payload = await buildBatchPdfPayload({
      chapters: pdfChapters,
      title: "测试书",
      rule: pdfRule,
      pdf: { outline: false, tocPage: false },
    });

    expect(payload.html).not.toContain("pdf-toc");
    expect(payload.html).toContain('id="batch-chapter-0"');
    expect(payload.styles).not.toContain(".pdf-toc");
    expect(payload.options.generateOutline).toBe(false);
  });

  it("标题不插入正文时即使开启目录页也不生成目录与锚点", async () => {
    const payload = await buildBatchPdfPayload({
      chapters: pdfChapters,
      title: "测试书",
      rule: { ...pdfRule, asHeading: false },
      pdf: { outline: true, tocPage: true },
    });

    expect(payload.html).not.toContain("pdf-toc");
    expect(payload.html).not.toContain("batch-chapter-0");
    expect(payload.options.generateOutline).toBe(true);
  });

  it("未传 pdf 设置时默认不生成书签大纲", async () => {
    const payload = await buildBatchPdfPayload({
      chapters: pdfChapters,
      title: "测试书",
      rule: pdfRule,
    });

    expect(payload.options.generateOutline).toBe(false);
    expect(payload.html).not.toContain("pdf-toc");
  });

  it("目录条目对标题做 HTML 转义", async () => {
    const payload = await buildBatchPdfPayload({
      chapters: [{ id: 1, title: '<script>"注入"</script>', depth: 0, content: [] }],
      title: "测试书",
      rule: pdfRule,
      pdf: { outline: true, tocPage: true },
    });

    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });
});

describe("flattenSelectedChapters 分组条目", () => {
  const tree: BatchExportTreeNode[] = [
    createNode({
      id: 1,
      title: "文件夹A",
      exportable: false,
      children: [
        createNode({ id: 11, title: "文档1", exportable: true }),
        createNode({ id: 12, title: "未选文档", exportable: true }),
      ],
    }),
    createNode({ id: 2, title: "空文件夹B", exportable: false, children: [] }),
    createNode({ id: 3, title: "顶层文档", exportable: true }),
  ];

  it("文件夹存在选中后代时插入分组条目，无选中后代不插入", () => {
    const chapters = flattenSelectedChapters(tree, new Set([11, 3]));

    expect(
      chapters.map(chapter => ({
        title: chapter.title,
        isGroup: !!chapter.isGroup,
      }))
    ).toEqual([
      { title: "文件夹A", isGroup: true },
      { title: "文档1", isGroup: false },
      { title: "顶层文档", isGroup: false },
    ]);
  });

  it("嵌套文件夹逐级插入分组条目", () => {
    const nested: BatchExportTreeNode[] = [
      createNode({
        id: 1,
        title: "外层",
        exportable: false,
        children: [
          createNode({
            id: 2,
            title: "内层",
            exportable: false,
            children: [createNode({ id: 3, title: "文档", exportable: true })],
          }),
        ],
      }),
    ];

    const chapters = flattenSelectedChapters(nested, new Set([3]));

    expect(chapters.map(chapter => chapter.title)).toEqual(["外层", "内层", "文档"]);
    expect(chapters[0].isGroup).toBe(true);
    expect(chapters[1].isGroup).toBe(true);
    expect(chapters[2].isGroup).toBeUndefined();
  });
});

describe("batch export pdf 分组条目", () => {
  it("分组标题拼接到首个内容章节正文，目录含分组层级", async () => {
    const chapters: BatchExportChapter[] = [
      { id: 1, title: "文件夹A", depth: 0, content: [], isGroup: true },
      { id: 11, title: "文档1", depth: 1, content: [] },
      { id: 3, title: "顶层文档", depth: 0, content: [] },
    ];
    const payload = await buildBatchPdfPayload({
      chapters,
      title: "分组测试",
      rule: pdfRule,
      pdf: { outline: true, tocPage: true },
    });

    // 目录：分组条目与内容条目都有链接，分组加粗
    expect(payload.html).toContain('href="#batch-chapter-0"');
    expect(payload.html).toContain('href="#batch-chapter-2"');
    expect(payload.html).toContain('class="pdf-toc-item pdf-toc-item-top"');

    // 正文：分组标题带锚点，与首个内容章节标题同处
    expect(payload.html).toContain('<h1 id="batch-chapter-0">文件夹A</h1>');
    expect(payload.html).toContain('<h2 id="batch-chapter-1">文档1</h2>');

    // 首个内容章节排在分组条目（index > 0）之后，不应添加多余分页
    expect(payload.html).not.toContain(
      '<section style="page-break-before: always;"><h1 id="batch-chapter-0">'
    );
    // 第二个内容章节正常分页
    expect(payload.html).toContain(
      '<section style="page-break-before: always;"><h1 id="batch-chapter-2">'
    );
  });

  it("标题不插入正文时分组条目不产生任何输出", async () => {
    const chapters: BatchExportChapter[] = [
      { id: 1, title: "文件夹A", depth: 0, content: [], isGroup: true },
      { id: 11, title: "文档1", depth: 1, content: [] },
    ];
    const payload = await buildBatchPdfPayload({
      chapters,
      title: "分组测试",
      rule: { ...pdfRule, asHeading: false },
      pdf: { outline: true, tocPage: true },
    });

    expect(payload.html).not.toContain("文件夹A");
    expect(payload.html).not.toContain("pdf-toc");
  });
});

describe("buildMergedMarkdown 分组条目", () => {
  it("分组条目不出现在合并结果中", () => {
    const chapters: BatchExportChapter[] = [
      { id: 1, title: "文件夹A", depth: 0, content: [], isGroup: true },
      { id: 11, title: "文档1", depth: 1, content: [] },
    ];

    const markdown = buildMergedMarkdown(chapters, pdfRule);

    expect(markdown).toContain("## 文档1");
    expect(markdown).not.toContain("文件夹A");
  });
});

describe("buildBatchEpubPayload 分组目录", () => {
  const build = (chapters: BatchExportChapter[], rule = pdfRule) =>
    buildBatchEpubPayload({
      chapters,
      metadata: {
        title: "测试书",
        author: "",
        language: "zh-CN",
        description: "",
      },
      rule,
    });

  it("分组标题拼入首个内容章节，nav 含层级条目与锚点", async () => {
    const { payload } = await build([
      { id: 1, title: "第一部分", depth: 0, content: [], isGroup: true },
      { id: 11, title: "文档1", depth: 1, content: [] },
      { id: 2, title: "文档2", depth: 0, content: [] },
    ]);

    // 分组不单独成章，只拼进第一个内容章节
    expect(payload.chapters).toHaveLength(2);
    expect(payload.chapters[0].xhtml).toContain('<h1 id="epub-group-0-0">第一部分</h1>');
    expect(payload.nav).toEqual([
      {
        title: "第一部分",
        chapterIndex: 0,
        anchor: "epub-group-0-0",
        level: 0,
      },
      { title: "文档1", chapterIndex: 0, level: 1 },
      { title: "文档2", chapterIndex: 1, level: 0 },
    ]);
  });

  it("标题不注入正文时 nav 保留分组层级但无锚点", async () => {
    const { payload } = await build(
      [
        { id: 1, title: "第一部分", depth: 0, content: [], isGroup: true },
        { id: 11, title: "文档1", depth: 1, content: [] },
      ],
      { ...pdfRule, asHeading: false }
    );

    expect(payload.chapters[0].xhtml).not.toContain("第一部分");
    expect(payload.nav?.[0]).toEqual({
      title: "第一部分",
      chapterIndex: 0,
      level: 0,
    });
  });

  it("无分组时 nav 条目与章节一一对应", async () => {
    const { payload } = await build([
      { id: 1, title: "文档1", depth: 0, content: [] },
      { id: 2, title: "文档2", depth: 0, content: [] },
    ]);

    expect(payload.nav).toEqual([
      { title: "文档1", chapterIndex: 0, level: 0 },
      { title: "文档2", chapterIndex: 1, level: 0 },
    ]);
  });
});

describe("批量构建进度回调", () => {
  it("buildBatchPdfPayload 按章节推进进度（分组跳过步也计数）", async () => {
    const events: Array<[number, number, string | undefined]> = [];
    await buildBatchPdfPayload({
      chapters: [
        { id: 1, title: "分组", depth: 0, content: [], isGroup: true },
        { id: 11, title: "文档1", depth: 1, content: [] },
        { id: 12, title: "文档2", depth: 1, content: [] },
      ],
      title: "测试书",
      rule: pdfRule,
      onProgress: (processed, total, label) => events.push([processed, total, label]),
    });

    expect(events).toEqual([
      [1, 3, undefined],
      [2, 3, "文档1"],
      [3, 3, "文档2"],
    ]);
  });

  it("buildBatchEpubPayload 按章节推进进度", async () => {
    const events: Array<[number, number, string | undefined]> = [];
    await buildBatchEpubPayload({
      chapters: [
        { id: 11, title: "文档1", depth: 0, content: [] },
        { id: 1, title: "分组", depth: 0, content: [], isGroup: true },
        { id: 12, title: "文档2", depth: 1, content: [] },
      ],
      metadata: {
        title: "测试书",
        author: "",
        language: "zh-CN",
        description: "",
      },
      rule: pdfRule,
      onProgress: (processed, total, label) => events.push([processed, total, label]),
    });

    expect(events).toEqual([
      [1, 3, "文档1"],
      [2, 3, undefined],
      [3, 3, "文档2"],
    ]);
  });

  it("buildMarkdownZipBytes 按文件推进进度", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    try {
      const events: Array<[number, number, string | undefined]> = [];
      const tree = [
        createNode({ id: 11, title: "文档1", exportable: true }),
        createNode({ id: 12, title: "文档2", exportable: true }),
      ];
      await buildMarkdownZipBytes(tree, new Set([11, 12]), (p, t, l) => events.push([p, t, l]));

      expect(events).toEqual([
        [1, 2, "文档1"],
        [2, 2, "文档2"],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
