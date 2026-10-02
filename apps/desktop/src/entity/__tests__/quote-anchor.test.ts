import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { buildQuoteAnchor, resolveQuoteAnchor } from "../quote-anchor";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const header = (text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 1): Descendant => ({
  type: "header",
  level,
  children: [{ type: "formatted", text }],
});
const quote =
  "把长文中的一节当作完整观点。抽成卡片时复制正文并保存出处，原文继续独立演化。引用锚点应当允许少量文字调整，但不能把已经删除的观点定位到无关段落。";
const original = [
  header("知识闭环"),
  header("渐进原子化", 2),
  paragraph(quote),
  paragraph("接下来讨论检索策略。"),
];
const anchor = buildQuoteAnchor(original, {
  start: { path: [2, 0], offset: 0 },
  end: { path: [2, 0], offset: quote.length },
});

describe("引述锚点", () => {
  it("生成引文、前后文与祖先标题，不修改正文", () => {
    expect(anchor).toEqual({
      exact: quote,
      prefix: "知识闭环\n渐进原子化\n",
      suffix: "\n接下来讨论检索策略。",
      heading: "知识闭环 › 渐进原子化",
    });
    expect(resolveQuoteAnchor(original, anchor)).toMatchObject({
      status: "exact",
      blockStart: 2,
      blockEnd: 2,
    });
  });
  it("重复引文按前后文消歧", () => {
    const content = [paragraph("前一处"), paragraph(quote), ...original];
    expect(resolveQuoteAnchor(content, anchor)).toMatchObject({ status: "exact", blockStart: 4 });
  });
  it("支持倒选、跨叶子与跨块选区", () => {
    const content: Descendant[] = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "甲乙" },
          { type: "formatted", text: "丙丁", bold: true },
        ],
      },
      paragraph("戊己"),
    ];
    const result = buildQuoteAnchor(content, {
      end: { path: [0, 1], offset: 1 },
      start: { path: [1, 0], offset: 1 },
    });
    expect(result.exact).toBe("丁\n戊");
    expect(resolveQuoteAnchor(content, result)).toMatchObject({ blockStart: 0, blockEnd: 1 });
  });
  it("截断引文与相邻上下文保持一致", () => {
    const content = [paragraph("甲".repeat(2100) + "乙")];
    const result = buildQuoteAnchor(content, {
      start: { path: [0, 0], offset: 0 },
      end: { path: [0, 0], offset: 2101 },
    });
    expect(result.exact).toHaveLength(2000);
    expect(result.suffix).toBe("甲".repeat(32));
    expect(result.truncated).toBe(true);
    expect(resolveQuoteAnchor(content, result).status).toBe("exact");
  });
  it("空引文和空正文降级", () => {
    expect(resolveQuoteAnchor([], anchor).status).toBe("lost");
    expect(resolveQuoteAnchor(original, { exact: "", prefix: "", suffix: "" }).status).toBe("lost");
  });
  it("局部选区改字后仍定位到所在长段", () => {
    const result = { exact: "抽成卡片时复制正文并保存出处", prefix: "", suffix: "" };
    expect(
      resolveQuoteAnchor([paragraph(quote.replace("保存出处", "记录出处"))], result)
    ).toMatchObject({ status: "fuzzy", blockStart: 0 });
  });
  it("编辑样本校准", () => {
    const cases = [
      {
        name: "改字",
        content: [
          ...original.slice(0, 2),
          paragraph(quote.replace("完整观点", "独立观点")),
          original[3],
        ],
        found: true,
      },
      {
        name: "增句",
        content: [
          ...original.slice(0, 2),
          paragraph(quote.replace("原文继续", "两者互不覆盖。原文继续")),
          original[3],
        ],
        found: true,
      },
      {
        name: "删句",
        content: [
          ...original.slice(0, 2),
          paragraph(quote.replace("原文继续独立演化。", "")),
          original[3],
        ],
        found: true,
      },
      {
        name: "调换段落",
        content: [...original.slice(0, 2), original[3], original[2]],
        found: true,
      },
      {
        name: "拆分段落",
        content: [...original.slice(0, 2), ...quote.split("。抽成").map(paragraph), original[3]],
        found: true,
      },
      {
        name: "整段改写",
        content: [
          ...original.slice(0, 2),
          paragraph("采用不同的组织方式管理知识，通过新的流程建立概念之间的联系。"),
          original[3],
        ],
        found: false,
      },
      { name: "整段删除", content: [...original.slice(0, 2), original[3]], found: false },
    ];
    const results = [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map(threshold => {
      const resolved = cases.map(sample => ({
        ...sample,
        result: resolveQuoteAnchor(sample.content, anchor, threshold),
      }));
      return {
        threshold,
        recovered: resolved.filter(sample => sample.found && sample.result.status !== "lost")
          .length,
        falsePositive: resolved.filter(sample => !sample.found && sample.result.status !== "lost")
          .length,
      };
    });
    console.table(results);
    expect(results.find(row => row.threshold === 0.75)).toMatchObject({
      recovered: 5,
      falsePositive: 0,
    });
    expect(resolveQuoteAnchor(cases[6].content, anchor)).toMatchObject({
      status: "lost",
      blockStart: 1,
    });
  });
});
