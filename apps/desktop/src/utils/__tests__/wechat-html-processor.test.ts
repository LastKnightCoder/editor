import { describe, expect, it } from "vitest";

import { processHtmlForWechat } from "../wechat/wechat-html-processor";

const stableOptions = {
  inlineStyles: false,
  removeEmptyParagraphs: false,
  convertDivToSection: false,
  handleSvgUse: false,
  handleMathJax: false,
  convertLinksToFootnotes: false,
} as const;

describe("wechat-html-processor code space protection", () => {
  it("应保护 shiki 代码块每行开头空格", () => {
    const html = processHtmlForWechat(
      '<pre><code class="shiki language-ts">  const a = 1\n    return a</code></pre>',
      "",
      stableOptions,
    );

    expect(html).toContain("&nbsp;&nbsp;const a = 1");
    expect(html).toContain("&nbsp;&nbsp;&nbsp;&nbsp;return a");
  });

  it("应兼容历史 hljs 代码块空格保护", () => {
    const html = processHtmlForWechat(
      '<pre><code class="hljs language-ts">  const a = 1\n    return a</code></pre>',
      "",
      stableOptions,
    );

    expect(html).toContain("&nbsp;&nbsp;const a = 1");
    expect(html).toContain("&nbsp;&nbsp;&nbsp;&nbsp;return a");
  });

  it("脚注区应按条目分块换行", () => {
    const html = processHtmlForWechat(
      '<p><a href="https://a.com">A</a> 与 <a href="https://b.com">B</a></p>',
      "",
      {
        ...stableOptions,
        convertLinksToFootnotes: true,
      },
    );

    expect(html).toContain('<section id="fn1" class="footnote-item">');
    expect(html).toContain('<section id="fn2" class="footnote-item">');
    expect(html).toContain(
      '</section><section id="fn2" class="footnote-item">',
    );
  });
});
