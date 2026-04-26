import { describe, expect, it } from "vitest";

import { normalizeEditorContent } from "../normalizeEditorContent";

describe("normalizeEditorContent", () => {
  it("空数组时应回退为默认空段落", () => {
    expect(normalizeEditorContent([])).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("非数组时应回退为默认空段落", () => {
    expect(normalizeEditorContent(null)).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("已有内容时应原样返回", () => {
    const content = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "hello" }],
      },
    ] as any;

    expect(normalizeEditorContent(content)).toBe(content);
  });
});
