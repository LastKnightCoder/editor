import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import { parseMarkdown, safeHref } from "./parse";

const render = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("介绍字段 Markdown", () => {
  it("原始 HTML 只按文字显示，不生成元素", () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>'
    );
    expect(html).not.toMatch(/<script|<img|<a /);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=");
  });

  it("只渲染 http(s)/mailto 链接，危险协议降级为文字", () => {
    const html = render(
      "[文档](https://example.com/docs) [坏](javascript:alert(1)) [数据](data:text/html,x)"
    );
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("不加载远程图片，只显示替代文字", () => {
    const html = render("![截图](https://tracker.example/pixel.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain("[图片：截图]");
  });

  it("支持常用块级与行内语法", () => {
    const blocks = parseMarkdown(
      "# 标题\n\n- 一\n- 二\n\n1. 甲\n\n> 引用\n\n```ts\nconst a = 1;\n```\n\n---\n\n**粗** *斜* `码`"
    );
    expect(blocks.map(block => block.type)).toEqual([
      "heading",
      "list",
      "list",
      "quote",
      "code",
      "rule",
      "paragraph",
    ]);
    const html = render("**粗** *斜* `码`");
    expect(html).toContain("<strong");
    expect(html).toContain("<em>");
    expect(html).toContain("<code");
  });

  it("蛇形命名中的下划线不当作斜体", () => {
    expect(render("调用 my_plugin_name 接口")).not.toContain("<em>");
  });
});
