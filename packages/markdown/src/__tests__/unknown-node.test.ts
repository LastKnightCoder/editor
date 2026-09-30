// ER-006 / ER-P3：没有 codec 的元素经 Markdown 往返必须无损。
import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";

import { createMarkdownProcessor } from "../index.ts";
import { paragraphCodec } from "./fixtures.ts";

// 兜底只取决于「没有 codec」；段落是正常文档的外壳，给它 codec，
// tabs / comment / whiteboard 这些没有 codec 的才走兜底
const {
  getMarkdown,
  getMarkdownWithPositions,
  importFromMarkdown,
  importFromMarkdownWithPositions,
} = createMarkdownProcessor({ codecs: [paragraphCodec] });

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", children });

const tabs = {
  type: "tabs",
  tabs: [{ title: "甲", key: "a" }],
  activeKey: "a",
  children: [{ type: "tab-pane", key: "a", children: [paragraph(text("标签页正文"))] }],
};
const whiteboard = { type: "whiteboard", whiteboardId: 3, height: 480, children: [text("")] };
const withComment = paragraph(
  text("前 "),
  {
    type: "comment",
    comments: [{ id: "c1", content: '说明 ] } " & 引号' }],
    children: [text("被批注")],
  },
  text(" 后")
);

const doc = [paragraph(text("开头")), tabs, whiteboard, withComment] as unknown as Descendant[];

describe("未知节点 Markdown 兜底", () => {
  it("块级节点输出为 tau-node 容器 + json 代码围栏", () => {
    const markdown = getMarkdown([whiteboard] as unknown as Descendant[]);
    expect(markdown).toBe(
      `:::tau-node{type="whiteboard"}\n\`\`\`json\n${JSON.stringify(whiteboard)}\n\`\`\`\n:::\n`
    );
  });

  it("行内节点输出为 tau-node 文本指令，正文可读", () => {
    const markdown = getMarkdown([withComment] as unknown as Descendant[]);
    expect(markdown).toMatch(/^前 :tau-node\[被批注\]\{type="comment" json="[^\n]+"\} 后\n$/);
  });

  it("往返无损：块级、void、行内", () => {
    const restored = importFromMarkdown(getMarkdown(doc));
    expect(restored).toEqual(doc);
  });

  it("带位置的导入导出同样无损", () => {
    const { markdown } = getMarkdownWithPositions(doc);
    expect(markdown).toBe(getMarkdown(doc));
    expect(importFromMarkdownWithPositions(markdown).content).toEqual(doc);
  });

  it.each(["第一行\n\n第二行", "第一行\r\n\r\n第二行", "第一行\u2028\u2029第二行"])(
    "含换行的未知行内正文 %s 两种往返都无损",
    value => {
      const content = [
        paragraph(
          text("前"),
          {
            type: "comment",
            comments: [{ id: "c1", content: "批注属性" }],
            children: [text(value)],
          },
          text("后")
        ),
      ] as unknown as Descendant[];
      const markdown = getMarkdown(content);
      expect(markdown).toContain(":tau-node[第一行 第二行]");
      expect(importFromMarkdown(markdown)).toEqual(content);
      const positioned = getMarkdownWithPositions(content);
      expect(positioned.markdown).toBe(markdown);
      expect(importFromMarkdownWithPositions(markdown).content).toEqual(content);
    }
  );

  it("JSON 里含反引号时围栏加长，不会提前闭合", () => {
    const node = { type: "mystery", code: "```js\nx\n````", children: [text("")] };
    const markdown = getMarkdown([node] as unknown as Descendant[]);
    expect(markdown).toContain("`````json");
    expect(importFromMarkdown(markdown)).toEqual([node]);
  });

  it("有 codec 的类型不走兜底", () => {
    const processor = createMarkdownProcessor({
      codecs: [{ type: "whiteboard", serializer: { isBlock: true, toMarkdown: () => "[白板]" } }],
    });
    expect(processor.getMarkdown([whiteboard] as unknown as Descendant[])).toBe("[白板]\n");
  });

  it("损坏的兜底块不抛错", () => {
    expect(() =>
      importFromMarkdown(':::tau-node{type="x"}\n```json\n{不是 json\n```\n:::\n')
    ).not.toThrow();
  });
});
