import { describe, expect, it } from "vitest";
import { Node, type Descendant } from "slate";
import { toPluginDocument } from "../pluginDocument";

const types = (nodes: Descendant[]) => {
  const found = new Set<string>();
  const walk = (node: Descendant) => {
    if ("type" in node) found.add(node.type);
    if ("children" in node) node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return found;
};
const textOf = (nodes: Descendant[]) => nodes.map(node => Node.string(node)).join("\n");

describe("插件资料文档化", () => {
  it("保留标题、列表、表格、代码、公式与 http 链接", () => {
    const nodes = toPluginDocument(
      [
        "# 标题",
        "正文 [官网](https://example.com) 与 `code`",
        "- [x] 任务",
        "1. 第一步",
        "| a | b |\n|---|---|\n| 1 | 2 |",
        "> 引用",
        "```ts\nconst a = 1\n```",
        "$$\nx^2\n$$",
        "---",
      ].join("\n\n")
    );
    const found = types(nodes);
    for (const type of [
      "header",
      "link",
      "check-list-item",
      "numbered-list",
      "table-cell",
      "blockquote",
      "code-block",
      "block-math",
      "divide-line",
    ])
      expect(found).toContain(type);
  });

  it("丢弃原始 HTML，图片不加载只留说明", () => {
    const nodes = toPluginDocument(
      "<div onclick='x'>html</div>\n\n<b>粗</b> 文本\n\n![截图](https://example.com/a.png)\n\n行内 ![图标](https://example.com/i.png) 图"
    );
    const found = types(nodes);
    expect(found).not.toContain("html-block");
    expect(found).not.toContain("html-inline");
    expect(found).not.toContain("image");
    expect(found).not.toContain("inline-image");
    expect(textOf(nodes)).toContain("图片不在应用内加载：截图");
    expect(textOf(nodes)).toContain("粗 文本");
  });

  it("mermaid、tikz 等会渲染 HTML 或调用编译的源码块按源码代码块展示", () => {
    const nodes = toPluginDocument(
      "```mermaid\ngraph TD;A-->B\n```\n\n```tikz\n\\draw (0,0) -- (1,1);\n```"
    );
    expect(types(nodes)).not.toContain("mermaid");
    expect(types(nodes)).not.toContain("tikz");
    expect(nodes).toMatchObject([
      { type: "code-block", language: "mermaid", code: "graph TD;A-->B" },
      { type: "code-block", language: "tikz", code: "\\draw (0,0) -- (1,1);" },
    ]);
  });

  it("非 http(s) 链接只保留文字", () => {
    const nodes = toPluginDocument("[点我](javascript:alert(1)) 与 [文件](file:///etc/passwd)");
    expect(types(nodes)).not.toContain("link");
    expect(textOf(nodes)).toContain("点我");
  });

  it("空资料得到一个空段落", () => {
    expect(toPluginDocument("")).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
  });
});
