// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { mathMarkdownCodecs } from "../../markdown.ts";

const md = createMarkdownProcessor({
  codecs: [...editorMarkdownCodecs, ...mathMarkdownCodecs],
  textCodecs: [textFormattingCodec],
});
describe("数学 codec 归属", () => {
  it.each(["$x^2$", "$$\nx^2\n$$"])("普通与带位置往返保持原语法：%s", source => {
    const value = md.importFromMarkdownWithPositions(source);
    expect(md.getMarkdown(value.content).trim()).toBe(source);
    expect(md.getMarkdownWithPositions(value.content).markdown.trim()).toBe(source);
  });
  it("内核不再拥有数学 codec，外包保留两种原类型", () => {
    expect(editorMarkdownCodecs.some(codec => codec.type.endsWith("-math"))).toBe(false);
    expect(mathMarkdownCodecs.map(codec => codec.type)).toEqual(["block-math", "inline-math"]);
  });
});
