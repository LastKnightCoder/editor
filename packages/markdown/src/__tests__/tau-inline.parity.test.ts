import { expect, it } from "vitest";
import { createMarkdownProcessor } from "../processor.ts";
import { decodeTauMarkdown, TAU_MARKDOWN_HEADER } from "../tau/index.ts";
import { isPlainTauInlineText } from "../tau/format.ts";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";

it("原生字面量子集与标准 Markdown 的行内解释一致", () => {
  const processor = createMarkdownProcessor({
    codecs: [...editorMarkdownCodecs],
    textCodecs: [textFormattingCodec],
  });
  const examples = [
    "普通文字",
    "第123行、第0列",
    "你好，世界。",
    "Hello world 123",
    "café déjà vu",
    "数字０１２３",
    "😀中文",
  ];
  for (const text of examples) {
    expect(isPlainTauInlineText(text)).toBe(true);
    const fence = "\u0060".repeat(3);
    const source =
      TAU_MARKDOWN_HEADER +
      '\n:::tau {"type":"paragraph"}\n' +
      fence +
      "tau-inline\n" +
      text +
      "\n" +
      fence +
      "\n:::\n";
    expect(decodeTauMarkdown(source).content).toEqual(processor.importFromMarkdown(text));
  }
  for (const text of [
    "",
    " 前空白",
    "后空白 ",
    "甲\n乙",
    "**加粗**",
    "x@y.com",
    "&amp;",
    "# 标题",
    "a\\b",
    "\u200b",
    "\ud800",
  ])
    expect(isPlainTauInlineText(text)).toBe(false);
});
