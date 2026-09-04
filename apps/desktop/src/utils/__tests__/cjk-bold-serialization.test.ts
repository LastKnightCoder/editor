import { describe, expect, it } from "vitest";

import type { FormattedText } from "@tau/editor/src";
import { getMarkdown, importFromMarkdown } from "../markdown";
import { getMarkdownWithPositions } from "../markdown-helper";

const paragraphLeaves = (markdown: string): FormattedText[] => {
  const content = importFromMarkdown(markdown);
  const paragraph = content[0] as { children?: FormattedText[] };
  return paragraph.children ?? [];
};

describe("CJK 加粗解析（remark-cjk-friendly）", () => {
  it("加粗内容以中文句号结尾且后跟中文时应解析出加粗", () => {
    const leaves = paragraphLeaves("**加粗。**后续文本");

    expect(leaves.find((leaf) => leaf.bold)?.text).toBe("加粗。");
    expect(leaves.find((leaf) => leaf.text === "后续文本")?.bold).toBeFalsy();
  });

  it("加粗内容以中文冒号结尾且两侧为中文时应解析出加粗", () => {
    const leaves = paragraphLeaves("中文**加粗：**文本");

    expect(leaves.find((leaf) => leaf.text === "中文")?.bold).toBeFalsy();
    expect(leaves.find((leaf) => leaf.bold)?.text).toBe("加粗：");
  });

  it("普通中文相邻加粗应正常解析", () => {
    const leaves = paragraphLeaves("中文**加粗**中文");

    expect(leaves.find((leaf) => leaf.bold)?.text).toBe("加粗");
  });
});

describe("CJK 删除线解析（remark-cjk-friendly-gfm-strikethrough）", () => {
  it("删除线内容以中文句号结尾且后跟中文时应解析出删除线", () => {
    const leaves = paragraphLeaves("~~删除线。~~后续文本");

    expect(leaves.find((leaf) => leaf.strikethrough)?.text).toBe("删除线。");
    expect(
      leaves.find((leaf) => leaf.text === "后续文本")?.strikethrough,
    ).toBeFalsy();
  });

  it("中文相邻删除线应支持导出后再解析", () => {
    const leaves = paragraphLeaves("中文~~删除~~中文");
    const markdown = getMarkdown([
      { type: "paragraph", children: leaves },
    ] as any);

    expect(markdown).not.toContain("\u200B");

    const reparsed = paragraphLeaves(markdown);
    expect(reparsed.find((leaf) => leaf.strikethrough)?.text).toBe("删除");
  });
});

describe("零宽空格清理", () => {
  it("中文相邻加粗序列化不应包含零宽空格", () => {
    const value = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "中文" },
          { type: "formatted", text: "加粗", bold: true },
          { type: "formatted", text: "中文" },
        ],
      },
    ];
    const markdown = getMarkdown(value as any);

    expect(markdown).not.toContain("\u200B");
    expect(markdown).toContain("**加粗**");
  });

  it("文本中残留的零宽空格导出时应被剥离", () => {
    const value = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "中\u200B文" }],
      },
    ];

    expect(getMarkdown(value as any)).not.toContain("\u200B");
  });

  it("导入时应剥离历史驻留的零宽空格", () => {
    const leaves = paragraphLeaves("中文\u200B**加粗**文本");

    expect(leaves.find((leaf) => leaf.text === "中文")).toBeTruthy();
    expect(leaves.every((leaf) => !leaf.text.includes("\u200B"))).toBe(true);
  });
});

describe("CJK 加粗往返与位置映射", () => {
  it("中文标点相邻加粗应支持导出后再解析", () => {
    const leaves = paragraphLeaves("**加粗。**后续文本");
    const markdown = getMarkdown([
      { type: "paragraph", children: leaves },
    ] as any);

    expect(markdown).not.toContain("\u200B");

    const reparsed = paragraphLeaves(markdown);
    expect(reparsed.find((leaf) => leaf.bold)?.text).toBe("加粗。");
  });

  it("位置映射版序列化不应包含零宽空格", () => {
    const value = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "中文" },
          { type: "formatted", text: "加粗", bold: true },
        ],
      },
    ];
    const { markdown } = getMarkdownWithPositions(value as any);

    expect(markdown).not.toContain("\u200B");
    expect(markdown).toContain("中文**加粗**");
  });
});
