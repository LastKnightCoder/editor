import { describe, expect, it } from "vitest";
import { parseIncomingMarkdown } from "../parseIncomingMarkdown";

describe("parseIncomingMarkdown", () => {
  it("解析正文并忽略 YAML 头", () => {
    const content = parseIncomingMarkdown("---\ntitle: 头信息\n---\n\n# 标题\n\n正文段落");
    const types = content.map(node => (node as { type?: string }).type);
    expect(types).not.toContain("yaml");
    expect(types).not.toContain("front-matter");
    expect(JSON.stringify(content)).toContain("正文段落");
    expect(JSON.stringify(content)).not.toContain("头信息");
  });

  it("空文件得到可渲染的空段落", () => {
    expect(parseIncomingMarkdown("")).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
  });
});
