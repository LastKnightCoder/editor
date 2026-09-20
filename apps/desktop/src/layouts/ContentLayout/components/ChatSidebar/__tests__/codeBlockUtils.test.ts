import { describe, expect, it } from "vitest";
import { shouldRenderAsBlockCode } from "../codeBlockUtils";

describe("ChatSidebar codeBlockUtils", () => {
  it("有 language class 时应渲染为块级代码", () => {
    expect(
      shouldRenderAsBlockCode({
        className: "language-ts",
      })
    ).toBe(true);
  });

  it("无语言但带块级代码标记时应渲染为块级代码", () => {
    expect(
      shouldRenderAsBlockCode({
        "data-markdown-block-code": "true",
      })
    ).toBe(true);
  });

  it("没有语言也没有块级标记时应保持为行内代码", () => {
    expect(
      shouldRenderAsBlockCode({
        className: undefined,
        "data-markdown-block-code": undefined,
      })
    ).toBe(false);
  });
});
