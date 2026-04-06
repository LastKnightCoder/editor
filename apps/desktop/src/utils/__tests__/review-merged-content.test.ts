import { describe, expect, it } from "vitest";

import { buildMergedReviewContent } from "../review-merged-content";

const collectTextLeaves = (nodes: any[]): any[] => {
  const leaves: any[] = [];
  const visit = (node: any) => {
    if (node && typeof node.text === "string") {
      leaves.push(node);
      return;
    }
    if (Array.isArray(node?.children)) {
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return leaves;
};

const getTextContent = (node: any): string => {
  return collectTextLeaves([node])
    .map((leaf) => leaf.text)
    .join("");
};

describe("buildMergedReviewContent", () => {
  it("应在原位置展示整段删除内容", () => {
    const beforeMarkdown = "第一段\n\n第二段";
    const secondParagraphStart = beforeMarkdown.indexOf("第二段");
    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown: "第一段",
      patches: [
        {
          operationId: "delete-second",
          op: "delete",
          start: secondParagraphStart,
          end: beforeMarkdown.length,
          beforeText: "第二段",
          afterText: "",
          charDelta: -"第二段".length,
        },
      ],
    }).content;

    expect(content).toHaveLength(2);
    const secondLeaves = collectTextLeaves([content[1]]);
    expect(getTextContent(content[1])).toBe("第二段");
    expect(secondLeaves.every((leaf) => leaf.diffType === "delete")).toBe(true);
  });

  it("应保留列表删除项的结构", () => {
    const beforeMarkdown = "- 保留项\n- 删除项\n- 保留二";
    const removedItemStart = beforeMarkdown.indexOf("- 删除项");
    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown: "- 保留项\n- 保留二",
      patches: [
        {
          operationId: "delete-list-item",
          op: "delete",
          start: removedItemStart,
          end: removedItemStart + "- 删除项\n".length,
          beforeText: "- 删除项\n",
          afterText: "",
          charDelta: -"- 删除项\n".length,
        },
      ],
    }).content;

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("bulleted-list");
    expect((content[0] as any).children).toHaveLength(3);
    const middleItem = (content[0] as any).children[1];
    const middleLeaves = collectTextLeaves([middleItem]);
    expect(getTextContent(middleItem)).toContain("删除项");
    expect(middleLeaves.every((leaf) => leaf.diffType === "delete")).toBe(true);
  });

  it("应在简单段落内联展示替换前后文本", () => {
    const content = buildMergedReviewContent({
      beforeMarkdown: "hello world",
      afterMarkdown: "hello tau",
      patches: [
        {
          operationId: "replace-world",
          op: "replace",
          start: 6,
          end: 11,
          beforeText: "world",
          afterText: "tau",
          charDelta: -2,
        },
      ],
    }).content;

    const leaves = collectTextLeaves(content);
    expect(leaves.map((leaf) => [leaf.text, leaf.diffType])).toEqual([
      ["hello ", undefined],
      ["world", "delete"],
      ["tau", "replace"],
    ]);
  });

  it("中文长句改写时应保留稳定的相同片段，而不是整句全量替换", () => {
    const content = buildMergedReviewContent({
      beforeMarkdown:
        "癌症怎么导致人死亡：常见不是「癌细胞本身」直接致死，而是肿瘤进展把身体拖到以下几类结局：",
      afterMarkdown:
        "癌症怎么把人“拖到不行”：通常不是癌细胞直接把人杀了，而是肿瘤发展后，身体扛不住这几类结局。",
      patches: [
        {
          operationId: "rewrite-sentence",
          op: "replace",
          start: 0,
          end: 44,
          beforeText:
            "癌症怎么导致人死亡：常见不是「癌细胞本身」直接致死，而是肿瘤进展把身体拖到以下几类结局：",
          afterText:
            "癌症怎么把人“拖到不行”：通常不是癌细胞直接把人杀了，而是肿瘤发展后，身体扛不住这几类结局。",
          charDelta: 2,
        },
      ],
    }).content;

    const leaves = collectTextLeaves(content);
    expect(leaves.length).toBeGreaterThan(6);
    expect(
      leaves.some(
        (leaf) => leaf.diffType === undefined && leaf.text.includes("不是"),
      ),
    ).toBe(true);
    expect(
      leaves.some(
        (leaf) => leaf.diffType === undefined && leaf.text.includes("癌细胞"),
      ),
    ).toBe(true);
    expect(
      leaves.some(
        (leaf) => leaf.diffType === "delete" && leaf.text.includes("导致"),
      ),
    ).toBe(true);
    expect(
      leaves.some(
        (leaf) => leaf.diffType === "replace" && leaf.text.includes("拖到不行"),
      ),
    ).toBe(true);
  });

  it("单个大 patch 覆盖整组列表时，仍应按 list-item 对齐而不是整块替换", () => {
    const beforeMarkdown = [
      "最常见结局：",
      "",
      "- 器官被“挤/堵/破坏” → 功能衰竭（最常见：呼吸衰竭）",
      "- 免疫/造血垮掉 → 严重感染（脓毒症）或大出血",
      "- 凝血异常/长期卧床等 → 血栓/栓塞等急症",
    ].join("\n");
    const afterMarkdown = [
      "最常见就记 3～4 条：",
      "",
      "- 器官被「挤/堵/破坏」→ 功能衰竭（最常见：呼吸衰竭）",
      "- 免疫/造血垮掉（骨髓受累或治疗抑制） → 重感染（脓毒症）或大出血",
      "- 凝血异常 + 久卧等 → 血栓/栓塞等急症",
      "- 另外还有：长期消耗（恶病质） → 人越来越虚",
    ].join("\n");

    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown,
      patches: [
        {
          operationId: "rewrite-bullets",
          op: "replace",
          start: 0,
          end: beforeMarkdown.length,
          beforeText: beforeMarkdown,
          afterText: afterMarkdown,
          charDelta: afterMarkdown.length - beforeMarkdown.length,
        },
      ],
    }).content;

    const list = content.find(
      (node: any) => node.type === "bulleted-list",
    ) as any;
    expect(list).toBeTruthy();
    expect(list.children.length).toBe(4);

    const secondItemLeaves = collectTextLeaves([list.children[1]]);
    expect(
      secondItemLeaves.some(
        (leaf) =>
          leaf.diffType === undefined && leaf.text.includes("免疫/造血垮掉"),
      ),
    ).toBe(true);
    expect(
      secondItemLeaves.some(
        (leaf) => leaf.diffType === "replace" && leaf.text.includes("骨髓受累"),
      ),
    ).toBe(true);

    const thirdItemLeaves = collectTextLeaves([list.children[2]]);
    expect(
      thirdItemLeaves.some(
        (leaf) => leaf.diffType === undefined && leaf.text.includes("凝血异常"),
      ),
    ).toBe(true);

    const fourthItemLeaves = collectTextLeaves([list.children[3]]);
    expect(fourthItemLeaves.every((leaf) => leaf.diffType === "insert")).toBe(
      true,
    );
  });

  it("callout 内部改写时应递归保留未变子块", () => {
    const beforeMarkdown = [
      ':::note{title="提示"}',
      "第一段原文",
      "",
      "- 保留项",
      "- 旧表述",
      ":::",
    ].join("\n");
    const afterMarkdown = [
      ':::note{title="提示"}',
      "第一段原文",
      "",
      "- 保留项",
      "- 新表述",
      ":::",
    ].join("\n");

    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown,
      patches: [
        {
          operationId: "rewrite-callout",
          op: "replace",
          start: 0,
          end: beforeMarkdown.length,
          beforeText: beforeMarkdown,
          afterText: afterMarkdown,
          charDelta: afterMarkdown.length - beforeMarkdown.length,
        },
      ],
    }).content;

    const callout = content[0] as any;
    expect(callout.type).toBe("callout");
    const leaves = collectTextLeaves([callout]);
    expect(leaves.some((leaf) => leaf.text.includes("第一段原文"))).toBe(true);
    expect(
      leaves.some(
        (leaf) => leaf.diffType === "delete" && leaf.text.includes("旧"),
      ),
    ).toBe(true);
    expect(
      leaves.some(
        (leaf) => leaf.diffType === "replace" && leaf.text.includes("新"),
      ),
    ).toBe(true);
  });

  it("highlight-block 颜色变化时应保留正文并展示属性变更", () => {
    const beforeMarkdown = [
      ":::highlight-block{color=yellow}",
      "高亮内容",
      ":::",
    ].join("\n");
    const afterMarkdown = [
      ":::highlight-block{color=blue}",
      "高亮内容",
      ":::",
    ].join("\n");

    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown,
      patches: [
        {
          operationId: "change-highlight-color",
          op: "replace",
          start: 0,
          end: beforeMarkdown.length,
          beforeText: beforeMarkdown,
          afterText: afterMarkdown,
          charDelta: afterMarkdown.length - beforeMarkdown.length,
        },
      ],
    }).content;

    const highlightBlock = content[0] as any;
    expect(highlightBlock.type).toBe("highlight-block");
    const leaves = collectTextLeaves([highlightBlock]);
    expect(leaves.some((leaf) => leaf.text.includes("高亮块颜色已修改"))).toBe(
      true,
    );
    expect(leaves.some((leaf) => leaf.text.includes("高亮内容"))).toBe(true);
  });

  it("code-block 应按代码行展示变更，而不是整块替换", () => {
    const beforeMarkdown = [
      "```ts",
      "const value = 1;",
      "console.log(value);",
      "```",
    ].join("\n");
    const afterMarkdown = [
      "```ts",
      "const value = 2;",
      "console.log(value);",
      "```",
    ].join("\n");

    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown,
      patches: [
        {
          operationId: "rewrite-code",
          op: "replace",
          start: 0,
          end: beforeMarkdown.length,
          beforeText: beforeMarkdown,
          afterText: afterMarkdown,
          charDelta: afterMarkdown.length - beforeMarkdown.length,
        },
      ],
    }).content;

    const leaves = collectTextLeaves(content);
    const paragraphs = content.map((node) => getTextContent(node as any));
    expect(paragraphs.some((text) => text.includes("- const value = 1;"))).toBe(
      true,
    );
    expect(paragraphs.some((text) => text.includes("+ const value ="))).toBe(
      true,
    );
    expect(
      leaves.some((leaf) => leaf.diffType && leaf.text.includes("2")),
    ).toBe(true);
    expect(
      leaves.some(
        (leaf) =>
          leaf.diffType === undefined && leaf.text.includes("console.log"),
      ),
    ).toBe(true);
  });

  it("长文仅显示变更块及上下文窗口", () => {
    const beforeMarkdown = [
      "第一段",
      "第二段",
      "第三段",
      "第四段",
      "第五段",
    ].join("\n\n");
    const afterMarkdown = [
      "第一段",
      "第二段",
      "第三段（已改）",
      "第四段",
      "第五段",
    ].join("\n\n");

    const content = buildMergedReviewContent({
      beforeMarkdown,
      afterMarkdown,
      patches: [
        {
          operationId: "rewrite-middle-paragraph",
          op: "replace",
          start: 0,
          end: beforeMarkdown.length,
          beforeText: beforeMarkdown,
          afterText: afterMarkdown,
          charDelta: afterMarkdown.length - beforeMarkdown.length,
        },
      ],
      options: {
        collapseUnchanged: true,
        contextRadius: 1,
      },
    }).content;

    const text = content.map((node) => getTextContent(node as any));
    expect(text).not.toContain("第一段");
    expect(text).toContain("第二段");
    expect(text).toContain("第四段");
    expect(text.some((value) => value.includes("…… 已折叠未改动内容 ……"))).toBe(
      true,
    );
  });
});
