import { describe, expect, it } from "vitest";

import { PositionMapper } from "../positionMapper";

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
