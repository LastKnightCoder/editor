import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";

import {
  markdownToOutline,
  outlineToMarkdown,
  MindOutlineDepthError,
  type MindOutline,
} from "../mind-markdown";

const p = (...children: object[]) => [{ type: "paragraph", children }] as unknown as Descendant[];
const t = (text: string, marks: object = {}) => ({ type: "formatted", text, ...marks });
const n = (text: Descendant[], children: MindOutline[] = []): MindOutline => ({ text, children });

/** 只比较结构与纯文字，外部格式解析的断言不关心行内标记拆分 */
const plain = (outline: MindOutline[]): unknown =>
  outline.map(node => [
    (
      node.text as unknown as Array<{
        children: Array<{ text?: string; children?: Array<{ text: string }> }>;
      }>
    )
      .flatMap(block => block.children)
      .map(child => child.text ?? child.children?.map(leaf => leaf.text).join(""))
      .join(""),
    plain(node.children),
  ]);

describe("导图与 Markdown 列表互转", () => {
  it.each(["a`b", "`边界`", "a``b`c", "  空格  ", "   ", "**原文**"])(
    "行内代码往返保留原文 %j",
    text => {
      const outline = [n(p(t(text, { code: true })))];
      expect(markdownToOutline(outlineToMarkdown(outline)).outline).toEqual(outline);
    }
  );

  it("拒绝超出剩余层级的列表，不返回部分子树", () => {
    const markdown = "- a\n  - b\n    - c";
    expect(plain(markdownToOutline(markdown, 2000, 3).outline)).toEqual([
      ["a", [["b", [["c", []]]]]],
    ]);
    expect(() => markdownToOutline(markdown, 2000, 2)).toThrow(MindOutlineDepthError);
    const deep = Array.from({ length: 2000 }, (_, depth) => `${" ".repeat(depth)}- x`).join("\n");
    expect(() => markdownToOutline(deep)).toThrow(MindOutlineDepthError);
  });

  it("导出再导入，层级、行内格式和链接保持不变", () => {
    const outline = [
      n(p(t("深度工作")), [
        n(p(t("为什么"), t("重要", { bold: true }))),
        n(p(t("怎么练"), t("习", { italic: true, bold: true })), [
          n(p(t("用 "), t("cron", { code: true }), t(" 排时段"))),
          n(p({ type: "link", url: "https://example.com/a?b=1", children: [t("参考")] })),
        ]),
        n(p(t("含 *星号* 与 [方括号] 的原文"), t("划掉", { strikethrough: true }))),
      ]),
      n(p(t("第二棵"))),
    ];
    expect(markdownToOutline(outlineToMarkdown(outline)).outline).toEqual(outline);
  });

  it("标题按级别嵌套，列表挂在最近的标题下，有序列表与任务列表都认", () => {
    const markdown = [
      "# 读书笔记",
      "## 第一章",
      "1. 固定时段",
      "2. 仪式感",
      "   - [x] 选地点",
      "## 第二章",
      "- 拥抱无聊",
    ].join("\n");
    expect(plain(markdownToOutline(markdown).outline)).toEqual([
      [
        "读书笔记",
        [
          [
            "第一章",
            [
              ["固定时段", []],
              ["仪式感", [["选地点", []]]],
            ],
          ],
          ["第二章", [["拥抱无聊", []]]],
        ],
      ],
    ]);
  });

  it("Tab 与空格缩进混用、缩进跳级时挂到最近的上一级", () => {
    const markdown = "- a\n\t- b\n        - c\n  - d\n- e";
    expect(plain(markdownToOutline(markdown).outline)).toEqual([
      [
        "a",
        [
          ["b", [["c", []]]],
          ["d", []],
        ],
      ],
      ["e", []],
    ]);
  });

  it("代码块、分隔线、空行不变成节点，引用符号去掉", () => {
    const markdown = "- a\n\n```\n- 不是节点\n```\n---\n> - b";
    expect(plain(markdownToOutline(markdown).outline)).toEqual([
      ["a", []],
      ["b", []],
    ]);
  });

  it("超过上限时只取前面的行并标记截断", () => {
    const markdown = Array.from({ length: 5 }, (_, i) => `- ${i}`).join("\n");
    const result = markdownToOutline(markdown, 3);
    expect(plain(result.outline)).toEqual([
      ["0", []],
      ["1", []],
      ["2", []],
    ]);
    expect(result.truncated).toBe(true);
    expect(markdownToOutline(markdown, 5).truncated).toBe(false);
  });
});
