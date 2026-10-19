import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Node, type Descendant } from "slate";
import { definePlugin } from "@tau/plugins";
import { createMarkdownProcessor } from "@tau/markdown";
import { desktopContentPlugins } from "../../../../shared/content-plugins";
import { htmlDefinition } from "@/test-fixtures/plugin-packages";
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

describe.each([false, true])("插件资料文档化（HTML 插件启用=%s）", enabled => {
  beforeEach(() => {
    desktopContentPlugins.install(enabled ? [htmlDefinition] : []);
  });
  afterEach(() => {
    desktopContentPlugins.install([]);
  });
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
    expect(textOf(nodes)).not.toContain("<");
    expect(textOf(nodes)).not.toContain("html");
  });

  it("链接、列表与表格中的 HTML 标签同样过滤，保留正文与安全链接", () => {
    const nodes = toPluginDocument(
      "[<b>链接</b>](https://example.com)\n\n- <i>列表</i>\n\n| 标题 |\n|---|\n| <span>单元格</span> |"
    );
    expect(types(nodes)).toContain("link");
    expect(types(nodes)).toContain("table-cell");
    expect(textOf(nodes)).toContain("链接");
    expect(textOf(nodes)).toContain("列表");
    expect(textOf(nodes)).toContain("单元格");
    expect(textOf(nodes)).not.toContain("<");
  });

  it("丢弃脚本、样式、注释与原始 HTML 媒体", () => {
    const nodes = toPluginDocument(
      '保留正文\n\n<script>alert("脚本")</script>\n\n<style>.隐藏{display:none}</style>\n\n<!-- 隐藏注释 -->\n\n<img src="https://example.com/a.png">'
    );
    expect(textOf(nodes)).toBe("保留正文");
  });

  it("代码示例、转义标签与比较表达式不被 HTML 过滤误删", () => {
    const nodes = toPluginDocument(
      "```html\n<div>代码示例</div>\n```\n\n`<b>行内代码</b>`\n\n&lt;b&gt;实体转义&lt;/b&gt;\n\n\\<i>反斜杠转义\\</i>\n\nx < 3 且 y > 1"
    );
    expect(nodes[0]).toMatchObject({ type: "code-block", code: "<div>代码示例</div>" });
    expect(textOf(nodes)).toContain("<b>行内代码</b>");
    expect(textOf(nodes)).toContain("<b>实体转义</b>");
    expect(textOf(nodes)).toContain("<i>反斜杠转义</i>");
    expect(textOf(nodes)).toContain("x < 3 且 y > 1");
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

  it("任意插件的围栏认领、导入、规范化与序列化都不参与资料展示", () => {
    const importNode = vi.fn(() => {
      throw new Error("资料不得调用插件导入");
    });
    const toMarkdown = vi.fn(() => {
      throw new Error("资料不得调用插件序列化");
    });
    const normalize = vi.fn(() => {
      throw new Error("资料不得调用插件规范化");
    });
    desktopContentPlugins.install([
      ...desktopContentPlugins.list(),
      definePlugin({
        id: "test.document",
        name: "资料隔离测试",
        version: "1.0.0",
        editorExtensions: [
          {
            id: "test.document",
            apiVersion: 1,
            elements: [{ type: "future.block", kind: "block", render: () => null }],
          },
        ],
        editorCodecs: [
          {
            type: "future.block",
            fence: { language: "future-dialect" },
            importNode,
            normalizeFor: { paragraph: normalize },
            serializer: { toMarkdown },
          },
        ],
      }),
    ]);
    const nodes = toPluginDocument('普通正文\n\n```future-dialect title="示例"\n第三方源码\n```');
    expect(nodes[1]).toMatchObject({
      type: "code-block",
      language: "future-dialect",
      code: "第三方源码",
      filename: "示例",
    });
    expect(textOf(nodes)).toContain("普通正文");
    expect(importNode).not.toHaveBeenCalled();
    expect(toMarkdown).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  });

  it.each(["html-block", "html-inline", "future.block"])(
    "未知节点 %s 统一保留可读文本，不按插件类型特殊处理",
    type => {
      const source = createMarkdownProcessor().getMarkdown([
        { type, children: [{ type: "formatted", text: "可读正文" }] },
      ] as unknown as Descendant[]);
      const nodes = toPluginDocument(source);
      expect(textOf(nodes)).toBe("可读正文");
      expect(types(nodes)).not.toContain(type);
    }
  );

  it("资料的元信息在语法层过滤，不需要识别对应编辑器类型", () => {
    const nodes = toPluginDocument("---\ntitle: 隐藏元信息\n---\n\n可读正文");
    expect(textOf(nodes)).toBe("可读正文");
  });

  it("应用内引用统一降级为可读文本，不保留其交互节点", () => {
    const nodes = toPluginDocument(":content-link[引用正文]{contentId=1 title=标题}");
    expect(textOf(nodes)).toBe("引用正文");
    expect(types(nodes)).not.toContain("content-link");
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
