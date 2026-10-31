import { describe, expect, it } from "vitest";
import { docsMarkdown } from "./editorMarkdown.ts";
import { extractOutline, headingAnchors } from "./outline.ts";

it("重复标题生成唯一锚点，包含已有数字后缀时仍不冲突", () => {
  expect(headingAnchors(["安装", "安装", "安装-1", "安装"])).toEqual([
    "安装",
    "安装-1",
    "安装-1-1",
    "安装-2",
  ]);
});

describe("extractOutline", () => {
  it("按正文顺序列出各级标题", () => {
    const value = docsMarkdown.importFromMarkdown(
      "## 安装\n\n正文\n\n### macOS\n\n## 卸载 **Tau**\n"
    );
    expect(extractOutline(value)).toEqual([
      { level: 2, title: "安装" },
      { level: 3, title: "macOS" },
      { level: 2, title: "卸载 Tau" },
    ]);
  });
});
