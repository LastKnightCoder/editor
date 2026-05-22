import { describe, expect, it } from "vitest";
import { sanitizeReaderHtml } from "../sanitize-reader-html";

describe("sanitizeReaderHtml", () => {
  it("应移除脚本、事件属性和 javascript 链接", () => {
    const html = sanitizeReaderHtml(`
      <p onclick="alert(1)">正文</p>
      <a href="javascript:alert(1)">危险链接</a>
      <img src="https://example.com/a.png" onerror="alert(1)" />
      <script>alert(1)</script>
    `);

    expect(html).toContain("<p>正文</p>");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
  });
});
