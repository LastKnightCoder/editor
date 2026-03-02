import { describe, expect, it } from "vitest";
import {
  buildEpubChapters,
  isMeaningfulHtmlFragment,
} from "../epub-export/chaptering";

describe("epub chaptering", () => {
  it("多个 H1 时按 H1 分章", () => {
    const html = `
      <h1>第一章</h1>
      <p>内容 A</p>
      <h2>小节 A-1</h2>
      <h1>第二章</h1>
      <p>内容 B</p>
    `;

    const result = buildEpubChapters(html, { fallbackTitle: "默认标题" });
    expect(result.strategy).toBe("h1");
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("第一章");
    expect(result.chapters[1].title).toBe("第二章");
  });

  it("单个 H1 + 多个 H2 时按 H2 分章", () => {
    const html = `
      <h1>总标题</h1>
      <p>导语</p>
      <h2>章节一</h2>
      <p>内容 1</p>
      <h2>章节二</h2>
      <p>内容 2</p>
    `;

    const result = buildEpubChapters(html, { fallbackTitle: "默认标题" });
    expect(result.strategy).toBe("h2");
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.chapters.some((chapter) => chapter.title === "章节一")).toBe(
      true,
    );
    expect(result.chapters.some((chapter) => chapter.title === "章节二")).toBe(
      true,
    );
  });

  it("没有 H1/H2 时生成单章", () => {
    const html = `<p>只有一段正文</p>`;
    const result = buildEpubChapters(html, { fallbackTitle: "单章文档" });

    expect(result.strategy).toBe("single");
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe("单章文档");
    expect(result.chapters[0].xhtml).toContain("只有一段正文");
  });

  it("前言仅含图片时仍保留前言章节", () => {
    const html = `
      <p><img src="https://example.com/preface.png" /></p>
      <h2>第一章</h2>
      <p>正文</p>
    `;
    const result = buildEpubChapters(html, { fallbackTitle: "默认标题" });
    expect(result.strategy).toBe("h2");
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].xhtml).toContain("<img");
    expect(result.chapters[1].title).toBe("第一章");
  });

  it("结构型片段（无文本）也应视为有效内容", () => {
    expect(
      isMeaningfulHtmlFragment('<div class="block-math"><svg></svg></div>'),
    ).toBe(true);
    expect(isMeaningfulHtmlFragment("<p> </p>")).toBe(false);
  });
});
