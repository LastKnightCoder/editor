import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    showSaveDialog: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock("electron", () => ({
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
  },
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mocks.writeFile,
  default: {
    writeFile: mocks.writeFile,
  },
}));

import { __epubExporterInternals, exportEpubWithDialog } from "../epub-exporter";
import type { EpubExportPayload } from "@/types/epub-export";

const payload: EpubExportPayload = {
  metadata: {
    title: "测试书名",
    author: "测试作者",
    language: "zh-CN",
    description: "测试简介",
    coverImageSrc: "assets/image-1.png",
  },
  chapters: [
    {
      id: "chapter-1",
      title: "第一章",
      xhtml:
        '<h1>第一章</h1><div class="callout callout-warning"><div class="callout-title"><img src="../assets/image-1.png" alt="">警告</div><div class="callout-content"><p>正文内容</p></div></div><pre class="code-block shiki"><code><span class="line">const a = 1;</span><span class="line">console.log(a);</span></code></pre>',
    },
  ],
  assets: [
    {
      id: "asset-image-1",
      fileName: "image-1.png",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    },
  ],
  defaultFileName: "测试书名",
};

describe("epub exporter", () => {
  beforeEach(() => {
    mocks.showSaveDialog.mockReset();
    mocks.writeFile.mockReset();
  });

  it("生成完整 EPUB 结构且 mimetype 为首条目并 store", async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "/tmp/test.epub",
    });
    mocks.writeFile.mockResolvedValue(undefined);

    const result = await exportEpubWithDialog(payload);

    expect(result.canceled).toBe(false);
    expect(result.filePath).toBe("/tmp/test.epub");
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);

    const writtenBuffer = Buffer.from(mocks.writeFile.mock.calls[0][1] as Uint8Array);

    // 校验 ZIP 首个 local header：PK\x03\x04 + method=store + fileName=mimetype
    expect(writtenBuffer.readUInt32LE(0)).toBe(0x04034b50);
    expect(writtenBuffer.readUInt16LE(8)).toBe(0);
    const fileNameLength = writtenBuffer.readUInt16LE(26);
    const extraFieldLength = writtenBuffer.readUInt16LE(28);
    const firstFileName = writtenBuffer.subarray(30, 30 + fileNameLength).toString("utf-8");
    expect(firstFileName).toBe("mimetype");
    const firstFileDataStart = 30 + fileNameLength + extraFieldLength;
    const mimeData = writtenBuffer
      .subarray(firstFileDataStart, firstFileDataStart + "application/epub+zip".length)
      .toString("utf-8");
    expect(mimeData).toBe("application/epub+zip");

    const archiveText = writtenBuffer.toString("utf-8");
    expect(archiveText).toContain("META-INF/container.xml");
    expect(archiveText).toContain("OEBPS/content.opf");
    expect(archiveText).toContain("OEBPS/nav.xhtml");
    expect(archiveText).toContain("OEBPS/toc.ncx");
    expect(archiveText).toContain("OEBPS/text/chapter-001.xhtml");
    expect(archiveText).toContain("OEBPS/styles/book.css");
    expect(archiveText).toContain("OEBPS/assets/image-1.png");
    const normalizedFragment = __epubExporterInternals.normalizeHtmlFragmentToXhtml(
      '<div class="callout-title"><img src="../assets/image-1.png" alt="">警告</div>'
    );
    expect(normalizedFragment).toContain('<img src="../assets/image-1.png" alt="" />');
    const navXhtml = __epubExporterInternals.buildNavXhtml(
      [
        {
          fileName: "text/chapter-001.xhtml",
          title: "第一章",
        },
      ],
      payload.metadata
    );
    expect(navXhtml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');

    const opf = __epubExporterInternals.buildContentOpf({
      metadata: payload.metadata,
      chapterItems: [
        {
          id: "chapter-1",
          fileName: "text/chapter-001.xhtml",
          title: "第一章",
        },
      ],
      assets: payload.assets,
      bookId: "urn:uuid:test-book-id",
      coverAssetId: payload.assets[0].id,
    });
    expect(opf).toContain('id="nav"');
    expect(opf).toContain('properties="nav"');
    expect(opf).toContain('idref="chapter-1"');
    expect(opf).toContain('xmlns:rendition="http://www.idpf.org/vocab/rendition/#"');
    expect(opf).toContain('<dc:identifier id="bookid">urn:uuid:test-book-id</dc:identifier>');
    expect(opf).toContain('<meta property="rendition:layout">reflowable</meta>');
    expect(opf).toContain('<meta property="rendition:spread">none</meta>');
    const tocNcx = __epubExporterInternals.buildTocNcx(
      [
        {
          fileName: "text/chapter-001.xhtml",
          title: "第一章",
        },
      ],
      payload.metadata,
      "urn:uuid:test-book-id"
    );
    expect(tocNcx).toContain('<meta name="dtb:uid" content="urn:uuid:test-book-id" />');
    expect(__epubExporterInternals.BOOK_CSS).toContain(".code-block.shiki .line");
    expect(__epubExporterInternals.BOOK_CSS).toContain(".callout-icon");
    expect(__epubExporterInternals.BOOK_CSS).toContain("background: transparent !important");
    expect(__epubExporterInternals.BOOK_CSS).toContain(".inline-code");
    expect(__epubExporterInternals.BOOK_CSS).toContain("color: #18045f");
    expect(__epubExporterInternals.BOOK_CSS).toContain("background: transparent;");
    expect(__epubExporterInternals.BOOK_CSS).toContain(".block-math");
    expect(__epubExporterInternals.BOOK_CSS).toContain("text-align: center");
    expect(__epubExporterInternals.BOOK_CSS).toContain(".table-cell");
    expect(__epubExporterInternals.BOOK_CSS).toContain("display: block");
    expect(__epubExporterInternals.BOOK_CSS).toContain("white-space: pre-wrap");
    expect(__epubExporterInternals.BOOK_CSS).toContain("overflow: visible !important");
  });

  it("用户取消保存时返回 canceled 且不写文件", async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });

    const result = await exportEpubWithDialog(payload);

    expect(result.canceled).toBe(true);
    expect(result.filePath).toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("nav 与 ncx 按层级嵌套生成且分组带锚点", () => {
    const navItems = [
      {
        fileName: "text/chapter-001.xhtml",
        title: "第一部分",
        anchor: "epub-group-0-0",
        level: 0,
      },
      { fileName: "text/chapter-001.xhtml", title: "文档1", level: 1 },
      { fileName: "text/chapter-002.xhtml", title: "文档2", level: 0 },
    ];

    const navXhtml = __epubExporterInternals.buildNavXhtml(navItems, payload.metadata);
    expect(navXhtml).toContain('<a href="text/chapter-001.xhtml#epub-group-0-0">第一部分</a>');
    // 嵌套：分组条目内部出现子 <ol>，子条目位于其中
    const groupStart = navXhtml.indexOf(">第一部分</a>");
    const nestedListStart = navXhtml.indexOf("<ol>", groupStart);
    const childItem = navXhtml.indexOf('<a href="text/chapter-001.xhtml">文档1</a>');
    const childItemClose = navXhtml.indexOf("</li>", childItem);
    expect(childItem).toBeGreaterThan(nestedListStart);
    // 顶层兄弟条目在分组 li 闭合之后
    const topLevelSibling = navXhtml.indexOf('<a href="text/chapter-002.xhtml">文档2</a>');
    const groupLiClose = navXhtml.indexOf("</li>", childItemClose + 1);
    expect(topLevelSibling).toBeGreaterThan(groupLiClose);

    const tocNcx = __epubExporterInternals.buildTocNcx(
      navItems,
      payload.metadata,
      "urn:uuid:test-book-id"
    );
    expect(tocNcx).toContain('<meta name="dtb:depth" content="2" />');
    expect(tocNcx).toContain('<content src="text/chapter-001.xhtml#epub-group-0-0" />');
    // navPoint 嵌套：navPoint-2（子）出现在 navPoint-1 的首个闭合标签之前
    const point1 = tocNcx.indexOf('id="navPoint-1"');
    const point2 = tocNcx.indexOf('id="navPoint-2"');
    const firstCloseAfterPoint1 = tocNcx.indexOf("</navPoint>", point1);
    expect(point2).toBeGreaterThan(point1);
    expect(point2).toBeLessThan(firstCloseAfterPoint1);
  });

  it("nav 缺省 level 时平铺且 depth 为 1", () => {
    const navItems = [
      { fileName: "text/chapter-001.xhtml", title: "第一章" },
      { fileName: "text/chapter-002.xhtml", title: "第二章" },
    ];

    const tocNcx = __epubExporterInternals.buildTocNcx(
      navItems,
      payload.metadata,
      "urn:uuid:test-book-id"
    );
    expect(tocNcx).toContain('<meta name="dtb:depth" content="1" />');
    expect(tocNcx).not.toContain('id="navPoint-3"');

    const navXhtml = __epubExporterInternals.buildNavXhtml(navItems, payload.metadata);
    expect(navXhtml.match(/<ol>/g)?.length).toBe(1);
  });
});
