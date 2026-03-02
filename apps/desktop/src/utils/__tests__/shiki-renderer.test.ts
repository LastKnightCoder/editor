import { describe, expect, it } from "vitest";

import { renderCodeWithShiki } from "../html-serializers/shiki-renderer";

describe("shiki-renderer", () => {
  it("typescript 代码应输出 shiki 结构与内联 token 颜色", async () => {
    const html = await renderCodeWithShiki(
      "const x = 1\nconst y = 2",
      "typescript",
    );

    expect(html).toContain("<pre");
    expect(html).toContain('class="');
    expect(html).toContain("code-block");
    expect(html).toContain("shiki");
    expect(html).toContain("language-typescript");
    expect(html).toContain('style="color:');
    expect(html).not.toContain('\n<span class="line"');
  });

  it("未知语言应回退为纯文本且进行 HTML 转义", async () => {
    const html = await renderCodeWithShiki(
      "const tag = '<div>'",
      "unknown-language-for-test",
    );

    expect(html).toContain("code-block shiki");
    expect(html).toContain("&lt;div&gt;");
    expect(html).not.toContain('style="color:');
  });

  it("应保留真实空行对应的 line 节点", async () => {
    const html = await renderCodeWithShiki("const a = 1\n\nconst b = 2", "ts");

    expect(html).toContain('<span class="line"></span>');
  });
});
