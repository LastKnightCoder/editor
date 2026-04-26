import { describe, expect, it } from "vitest";
import { generateSummaryIndex } from "../vibe-learning-ai-chapter-splitter";

describe("vibe-learning-ai-chapter-splitter", () => {
  it("generateSummaryIndex 应输出结构化章节索引详情", () => {
    const markdown = generateSummaryIndex("测试资料", [
      {
        index: 0,
        title: "第一章",
        description: "介绍整体背景",
        headingLevel: 1,
        content: "# 第一章\n内容 A",
      },
      {
        index: 1,
        title: "第二章",
        description: "展开核心方法",
        headingLevel: 1,
        content: "# 第二章\n内容 B",
      },
    ]);

    expect(markdown).toContain("## 章节目录");
    expect(markdown).toContain("## 章节索引详情");
    expect(markdown).toContain("### 章节 1");
    expect(markdown).toContain("- 标题：第一章");
    expect(markdown).toContain("- 摘要：介绍整体背景");
    expect(markdown).toContain("- 文件：01-第一章.md");
  });
});
