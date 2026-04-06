import { describe, expect, it } from "vitest";
import { applyHighlight, removeHighlight } from "../highlighter";
import type { Highlight } from "../types";

const createHighlight = (id = "highlight-1"): Highlight => ({
  id,
  range: {
    startXPath: "",
    startOffset: 0,
    endXPath: "",
    endOffset: 0,
    text: "",
  },
  style: "marker",
  color: "pink",
  createdAt: Date.now(),
});

describe("highlighter", () => {
  it("同一 text node 内的部分选区只包裹选中内容", () => {
    const container = document.createElement("p");
    const textNode = document.createTextNode(
      "换句话说，不是“让 AI 帮忙写点函数”，而是",
    );
    container.appendChild(textNode);
    document.body.appendChild(container);

    const fullText = textNode.data;
    const startOffset = fullText.indexOf("让 AI");
    const endOffset = fullText.indexOf("函数") + "函数".length;

    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, endOffset);

    const marks = applyHighlight(createHighlight(), range);

    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("让 AI 帮忙写点函数");
    expect(container.textContent).toBe(fullText);

    removeHighlight("highlight-1");
    expect(container.textContent).toBe(fullText);
  });

  it("跨多个 text node 时仍只包裹选中片段", () => {
    const container = document.createElement("p");
    const first = document.createTextNode("第一段文本");
    const strong = document.createElement("strong");
    const second = document.createTextNode("第二段文本");
    strong.appendChild(second);
    container.appendChild(first);
    container.appendChild(strong);
    document.body.appendChild(container);

    const range = document.createRange();
    range.setStart(first, 2);
    range.setEnd(second, 3);

    const marks = applyHighlight(createHighlight("highlight-2"), range);

    expect(marks.map((mark) => mark.textContent)).toEqual(["段文本", "第二段"]);
    expect(container.textContent).toBe("第一段文本第二段文本");

    removeHighlight("highlight-2");
    expect(container.textContent).toBe("第一段文本第二段文本");
  });
});
