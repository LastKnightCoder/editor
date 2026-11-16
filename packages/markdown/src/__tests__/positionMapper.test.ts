import { describe, expect, it } from "vitest";

import { PositionMapper } from "../positionMapper.ts";

const createCodeBlockMapper = () => {
  const mapper = new PositionMapper();
  mapper.addElementMapping({
    type: "element",
    slateElementPath: [2],
    elementType: "code-block",
    isVoid: true,
    mdStartLine: 2,
    mdStartCh: 0,
    mdEndLine: 7,
    mdEndCh: 3,
    propertyMappings: {
      code: {
        mdStartLine: 3,
        mdStartCh: 2,
        mdEndLine: 5,
        mdEndCh: 6,
      },
    },
  });
  return mapper;
};

describe("PositionMapper.getElementPropertyByMarkdown", () => {
  it("应命中代码块属性区间内的常规位置", () => {
    const mapper = createCodeBlockMapper();
    const result = mapper.getElementPropertyByMarkdown({ line: 3, ch: 4 });

    expect(result).not.toBeNull();
    expect(result?.propertyName).toBe("code");
    expect(result?.relativePos).toEqual({ line: 0, ch: 2 });
  });

  it("应命中代码块属性区间的结束边界位置", () => {
    const mapper = createCodeBlockMapper();
    const result = mapper.getElementPropertyByMarkdown({ line: 5, ch: 6 });

    expect(result).not.toBeNull();
    expect(result?.propertyName).toBe("code");
    expect(result?.relativePos).toEqual({ line: 2, ch: 4 });
  });

  it("不应命中代码块范围之外的位置", () => {
    const mapper = createCodeBlockMapper();
    const result = mapper.getElementPropertyByMarkdown({ line: 9, ch: 0 });

    expect(result).toBeNull();
  });
});

describe("PositionMapper 文本落点", () => {
  it("标题标记匹配同一行标题开头，而非上一个段落末尾", () => {
    const mapper = new PositionMapper();
    mapper.addTextMapping({
      type: "text",
      slateTextPath: [0, 0],
      slateOffset: 0,
      slateLength: 3,
      mdLine: 0,
      mdCh: 0,
      mdLength: 3,
      prefixLength: 0,
      suffixLength: 0,
    });
    mapper.addTextMapping({
      type: "text",
      slateTextPath: [1, 0],
      slateOffset: 0,
      slateLength: 2,
      mdLine: 2,
      mdCh: 3,
      mdLength: 2,
      prefixLength: 0,
      suffixLength: 0,
    });
    expect(mapper.markdownToSlate({ line: 2, ch: 1 })).toEqual({ path: [1, 0], offset: 0 });
  });

  it("多行正文按各行的前缀和正文偏移往返", () => {
    const mapper = new PositionMapper();
    mapper.addTextMapping({
      type: "text",
      slateTextPath: [2, 0, 0],
      slateOffset: 0,
      slateLength: 7,
      mdLine: 2,
      mdCh: 4,
      mdLength: 9,
      prefixLength: 0,
      suffixLength: 0,
      mdEnd: { line: 3, ch: 5 },
      sourceLines: [
        { line: 2, ch: 4, offset: 0, length: 3 },
        { line: 3, ch: 2, offset: 4, length: 3 },
      ],
    });
    expect(mapper.markdownToSlate({ line: 3, ch: 4 })).toEqual({ path: [2, 0, 0], offset: 6 });
    expect(mapper.slateToMarkdown({ path: [2, 0, 0], offset: 6 })).toEqual({ line: 3, ch: 4 });
  });
});
