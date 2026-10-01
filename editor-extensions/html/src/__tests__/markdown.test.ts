// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { htmlMarkdownCodecs } from "../../markdown.ts";

const md = createMarkdownProcessor({
  codecs: [...editorMarkdownCodecs, ...htmlMarkdownCodecs],
  textCodecs: [textFormattingCodec],
});
describe("HTML codec 拆包", () => {
  it.each(["html-block", "html-inline"])("%s 沿用原序列化语法", type => {
    const source = type === "html-block" ? "<div>x</div>" : "<b>x</b>";
    const value = [{ type, html: source, children: [{ type: "formatted", text: "" }] }];
    expect(md.getMarkdown(value as never).trim()).toBe(source);
  });
  it.each(['<div class="p-4">块级内容</div>', "前面 <b>行内内容</b> 后面"])(
    "普通与位置映射往返：%s",
    source => {
      const parsed = md.importFromMarkdownWithPositions(source);
      expect(md.getMarkdown(parsed.content).trim()).toBe(source);
      expect(md.getMarkdownWithPositions(parsed.content).markdown.trim()).toBe(source);
      // 旧块级 HTML codec 不声明属性映射；行内文本继续由框架映射。
      if (source.startsWith("<div")) expect(parsed.positionMap.getMappings()).toEqual([]);
      else expect(parsed.positionMap.getMappings().length).toBeGreaterThan(0);
    }
  );
  it("内核不再拥有 HTML codec，纯包仅导出两种 HTML 类型", () => {
    expect(editorMarkdownCodecs.some(codec => codec.type.startsWith("html-"))).toBe(false);
    expect(htmlMarkdownCodecs.map(codec => codec.type)).toEqual(["html-block", "html-inline"]);
  });
});
