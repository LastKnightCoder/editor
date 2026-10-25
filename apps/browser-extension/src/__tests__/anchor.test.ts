import { afterEach, describe, expect, it } from "vitest";
import { anchorToRange, createAnchor, locateAnchor } from "../content/page/anchor";
import { buildTextIndex, offsetsToRange, rangeToOffsets } from "../content/page/text-index";

const page = (html: string) => {
  document.body.innerHTML = html;
  return document.body;
};

const select = (node: Node, start: number, end: number, endNode: Node = node) => {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(endNode, end);
  return range;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("text index", () => {
  it("跨节点的 Range 与偏移互转", () => {
    const body = page("<p>Hello <b>brave</b> world</p><script>skip()</script>");
    const index = buildTextIndex(body);
    expect(index.text).toBe("Hello brave world");
    const bold = body.querySelector("b")!.firstChild!;
    const tail = body.querySelector("p")!.lastChild!;
    const offsets = rangeToOffsets(index, select(bold, 2, 3, tail));
    expect(offsets).toEqual({ start: 8, end: 14 });
    expect(offsetsToRange(index, 8, 14)!.toString()).toBe("ave wo");
  });

  it("排除伴读自己的宿主元素", () => {
    const body = page("<p>正文</p><tau-companion>面板</tau-companion>");
    expect(buildTextIndex(body, body.querySelector("tau-companion")).text).toBe("正文");
  });
});

describe("anchor", () => {
  it("原位置未变时精确命中", () => {
    const body = page("<p>The forgetting curve is a feature.</p>");
    const text = body.querySelector("p")!.firstChild!;
    const anchor = createAnchor(buildTextIndex(body), select(text, 4, 20))!;
    expect(anchor.quote).toEqual({
      exact: "forgetting curve",
      prefix: "The ",
      suffix: " is a feature.",
    });
    expect(anchorToRange(buildTextIndex(body), anchor)!.toString()).toBe("forgetting curve");
  });

  it("前面插入内容后按原文 + 前后文重新定位", () => {
    const body = page("<p>alpha beta gamma</p>");
    const anchor = createAnchor(
      buildTextIndex(body),
      select(body.querySelector("p")!.firstChild!, 6, 10)
    )!;
    page("<p>NEW INTRO</p><p>alpha beta gamma</p>");
    expect(anchorToRange(buildTextIndex(document.body), anchor)!.toString()).toBe("beta");
  });

  it("原文出现多次时用前后文挑对的那一处", () => {
    const body = page("<p>see note here. Another note there.</p>");
    const index = buildTextIndex(body);
    const second = index.text.lastIndexOf("note");
    const anchor = createAnchor(index, offsetsToRange(index, second, second + 4)!)!;
    page("<p>Intro. see note here. Another note there.</p>");
    const moved = buildTextIndex(document.body);
    const located = locateAnchor(moved, anchor)!;
    expect(moved.text.slice(located.start - 8, located.end)).toBe("Another note");
  });

  it("原文已不在页面上时返回 null", () => {
    const body = page("<p>something</p>");
    const anchor = createAnchor(
      buildTextIndex(body),
      select(body.querySelector("p")!.firstChild!, 0, 4)
    )!;
    page("<p>completely different</p>");
    expect(anchorToRange(buildTextIndex(document.body), anchor)).toBeNull();
  });
});

describe("早期划线（无锚点）", () => {
  it("按原文找回位置", () => {
    const body = page("<p>one two three</p>");
    const range = anchorToRange(buildTextIndex(body), {
      quote: { exact: "two", prefix: "", suffix: "" },
      position: { start: -1, end: -1 },
    });
    expect(range?.toString()).toBe("two");
  });
});
