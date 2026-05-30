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
  it("应为整篇微信内容保留左右内边距", () => {
    const html = processHtmlForWechat(
      '<div class="wechat-content"><p>正文</p></div>',
    );

    expect(html).toContain(
      '<section class="wechat-content" style="margin: 0; padding: 0; box-sizing: border-box; font-family: Optima, \'Microsoft YaHei\', PingFangSC-regular, serif; padding-left: 1em; padding-right: 1em;">',
    );
  });

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

    expect(html).toContain('<section id="fn1" class="footnote-item"');
    expect(html).toContain('<section id="fn2" class="footnote-item"');
    expect(html).toContain('</section><section id="fn2" class="footnote-item"');
  });

  it("脚注区应内联缩进、Serif 字体和更小字号", () => {
    const html = processHtmlForWechat(
      '<p><a href="https://a.com">A</a></p>',
      "",
      {
        ...stableOptions,
        convertLinksToFootnotes: true,
      },
    );

    expect(html).toContain(
      'class="footnotes-section" style="margin: 0; padding: 0 0 0 2.5em;',
    );
    expect(html).toContain("font-family: Georgia, 'Times New Roman'");
    expect(html).toContain("font-size: 13px");
    expect(html).toContain('class="footnote-url" style=');
  });
});
