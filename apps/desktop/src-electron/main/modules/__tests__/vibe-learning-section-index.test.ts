import { describe, expect, it } from "vitest";

import {
  buildSectionNodesFromMarkdown,
  resolveSectionContextForLineRange,
} from "../vibe-learning-section-index";

describe("vibe-learning-section-index", () => {
  it("应从 markdown 标题中提取 section 树", () => {
    const nodes = buildSectionNodesFromMarkdown(`
# 第一章

## Attention 机制

内容 A

### Query / Key / Value

内容 B
`);

    expect(nodes.map((node) => node.title)).toEqual([
      "第一章",
      "Attention 机制",
      "Query / Key / Value",
    ]);
    expect(nodes[2]?.pathTitles).toEqual([
      "第一章",
      "Attention 机制",
      "Query / Key / Value",
    ]);
  });

  it("普通正文不包含标题文本时，不应回退到最后一个标题", () => {
    const markdown = `
# 第一章

## Attention 机制

Attention 通过输入向量计算权重。
这段正文本身不包含标题字符串。

## Multi-Head

多头注意力会拆分多个头。
`.trim();

    const nodes = buildSectionNodesFromMarkdown(markdown);
    const context = resolveSectionContextForLineRange(nodes, {
      startLine: 4,
      endLine: 5,
    });

    expect(context?.sectionTitle).toBe("Attention 机制");
    expect(context?.sectionPath).toEqual(["第一章", "Attention 机制"]);
  });

  it("chunk 跨 section 边界时，应优先归属重叠更多的 section", () => {
    const markdown = `
# 第一章

## Section A

A1
A2

## Section B

B1
B2
B3
`.trim();

    const nodes = buildSectionNodesFromMarkdown(markdown);
    const context = resolveSectionContextForLineRange(nodes, {
      startLine: 5,
      endLine: 10,
    });

    expect(context?.sectionTitle).toBe("Section B");
    expect(context?.sectionPath).toEqual(["第一章", "Section B"]);
  });
});
