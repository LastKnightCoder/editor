import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import {
  INLINE_PLACEHOLDER,
  INSIGHT_MAX_MARKS,
  blockText,
  buildInsightsUserPrompt,
  parseInsightsOutput,
  promptSectionsOf,
  type PromptSection,
} from "../content-insights-prompt";

const text = (value: string) => ({ type: "formatted", text: value });
const para = (...children: unknown[]) => ({ type: "paragraph", children }) as unknown as Descendant;
const header = (value: string) =>
  ({ type: "header", level: 2, children: [text(value)] }) as unknown as Descendant;
const link = (value: string) => ({ type: "content-link", refId: 1, children: [text(value)] });

const CONTENT: Descendant[] = [
  header("布局"),
  para(text("读 offsetTop 时会触发强制同步布局，"), link("重排与重绘"), text("里也提到过。")),
  header("合成"),
  para(text("只改 transform 和 opacity 时可以只走合成。")),
  {
    type: "code-block",
    code: "el.style.transform = 'x'",
    children: [text("")],
  } as unknown as Descendant,
  {
    type: "bulleted-list",
    children: [
      { type: "list-item", children: [para(text("第一项"))] },
      { type: "list-item", children: [para(text("第二项"))] },
    ],
  } as unknown as Descendant,
];
const SECTIONS: PromptSection[] = [
  { no: 1, heading: "布局", blockStart: 0, blockEnd: 1, text: "" },
  { no: 2, heading: "合成", blockStart: 2, blockEnd: 5, text: "" },
];
const out = (marks: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ lead: "位置", marks, asks: ["问一"], ...extra });

describe("content-insights-prompt", () => {
  it("块文字：行内元素与代码换成占位，子块之间换行；给模型读时保留", () => {
    expect(blockText(CONTENT[1])).toBe(
      `读 offsetTop 时会触发强制同步布局，${INLINE_PLACEHOLDER.repeat(5)}里也提到过。`
    );
    expect(blockText(CONTENT[1], true)).toBe(
      "读 offsetTop 时会触发强制同步布局，重排与重绘里也提到过。"
    );
    expect(blockText(CONTENT[4])).toBe(
      INLINE_PLACEHOLDER.repeat("el.style.transform = 'x'".length)
    );
    expect(blockText(CONTENT[5])).toBe("\n\n第一项\n\n第二项");
  });

  it("校验：片段要逐字在该节的某一块里，不能落在已有链接与代码上，不能跨块；候选编号要存在", () => {
    const parsed = parseInsightsOutput(
      out([
        { type: "link", section: 1, anchor: "强制同步布局", candidate: 2, why: "理由" },
        { type: "link", section: 1, anchor: "重排与重绘", candidate: 2, why: "已有链接" },
        { type: "link", section: 2, anchor: "强制同步布局", candidate: 2, why: "节不对" },
        { type: "link", section: 1, anchor: "强制同步布局", candidate: 9, why: "候选不存在" },
        { type: "dup", section: 2, anchor: "第一项\n\n第二项", candidate: 1, why: "跨块" },
        { type: "link", section: 2, anchor: "transform = ", candidate: 1, why: "代码" },
        {
          type: "conflict",
          section: 2,
          anchor: "只改 transform 和 opacity",
          candidate: 1,
          why: "条件不同",
          mine: "只走合成",
          theirs: "会重绘",
        },
        { type: "gap", section: 2, text: "合成层怎么划分", why: "没写" },
        { type: "link", section: 1, anchor: "强制同步布局", candidate: 2, why: "重复的一条" },
        { type: "weird", section: 1, anchor: "布局", candidate: 1 },
      ]),
      CONTENT,
      SECTIONS,
      new Set([1, 2])
    )!;
    expect(parsed.marks.map(m => [m.kind, m.block, m.anchor || m.text])).toEqual([
      ["link", 1, "强制同步布局"],
      ["conflict", 3, "只改 transform 和 opacity"],
      ["gap", 5, "合成层怎么划分"],
    ]);
    expect(parsed.marks[1]).toMatchObject({ mine: "只走合成", theirs: "会重绘", candidate: 1 });
    expect(parsed.asks).toEqual(["问一"]);
  });

  it("容忍代码块包裹；超过上限截断；无法解析返回 null", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      type: "gap",
      section: 1,
      text: `展开 ${i}`,
    }));
    const parsed = parseInsightsOutput(
      "```json\n" + out(many) + "\n```",
      CONTENT,
      SECTIONS,
      new Set()
    )!;
    expect(parsed.marks).toHaveLength(INSIGHT_MAX_MARKS);
    expect(parseInsightsOutput("不是 JSON", CONTENT, SECTIONS, new Set())).toBeNull();
  });

  it("提示词：节编号、候选的要点与主张、已有连接；正文超出预算的节不给", () => {
    const sections = promptSectionsOf(CONTENT, [
      {
        chunkIndex: 0,
        headingPath: "布局",
        text: "",
        blockStart: 0,
        blockEnd: 1,
        charCount: 0,
        embeddingText: "",
      },
      {
        chunkIndex: 1,
        headingPath: "合成",
        text: "",
        blockStart: 2,
        blockEnd: 5,
        charCount: 0,
        embeddingText: "",
      },
    ]);
    expect(sections[0].text).toContain("重排与重绘里也提到过");
    const { prompt, sections: used } = buildInsightsUserPrompt({
      kindLabel: "文章",
      title: "浏览器渲染",
      topic: "前端 › 渲染",
      linkedCount: 2,
      linkedTitles: ["重排与重绘"],
      sections: [
        ...sections,
        { no: 3, heading: "很长", blockStart: 6, blockEnd: 6, text: "字".repeat(7000) },
      ],
      candidates: [
        {
          no: 1,
          kindLabel: "卡片",
          title: "掉帧排查",
          heading: "",
          summary: "批量读写",
          claims: ["读布局会强制同步"],
          excerpt: "滚动回调里读 offsetTop",
        },
      ],
    });
    expect(prompt).toContain("[节 1] 布局");
    expect(prompt).toContain("所属主题：前端 › 渲染");
    expect(prompt).toContain("已有连接：2 处（《重排与重绘》）");
    expect(prompt).toContain("[候选 1] 卡片《掉帧排查》");
    expect(prompt).toContain("主张：读布局会强制同步");
    expect(used.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(6000);
  });
});
