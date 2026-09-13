import { describe, expect, it } from "vitest";
import { getContentLength } from "./content-length";

describe("getContentLength", () => {
  it("统计 formatted 文本字数（中英文混排）", () => {
    expect(
      getContentLength([{ type: "formatted", text: "你好 world" }])
    ).toBeGreaterThan(0);
  });

  it("代码块与公式计入字数", () => {
    const length = getContentLength([
      { type: "code-block", code: "const a = 1" },
      { type: "inline-math", tex: "E=mc^2" },
    ]);
    expect(length).toBeGreaterThan(0);
  });

  it("旧 tabs 形态只补算非激活 Tab 的内容", () => {
    const length = getContentLength([
      {
        type: "tabs",
        activeKey: "a",
        tabsContent: [
          { key: "a", content: [{ type: "formatted", text: "激活内容" }] },
          { key: "b", content: [{ type: "formatted", text: "后台内容" }] },
        ],
        children: [],
      } as never,
    ]);
    // 激活 Tab 的内容由 children 树覆盖（此例为空），只应统计到后台 Tab
    expect(length).toBe(getContentLength([{ type: "formatted", text: "后台内容" }]));
  });

  it("空内容为 0", () => {
    expect(getContentLength([])).toBe(0);
    expect(getContentLength([{ type: "paragraph", children: [] }])).toBe(0);
  });
});
