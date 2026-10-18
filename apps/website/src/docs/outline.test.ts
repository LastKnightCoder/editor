import { describe, expect, it } from "vitest";
import { docsMarkdown } from "./editorMarkdown.ts";
import { extractOutline } from "./outline.ts";

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
