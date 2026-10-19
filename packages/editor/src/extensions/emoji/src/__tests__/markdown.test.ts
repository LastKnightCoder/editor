// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { emojiCodec } from "../../markdown.ts";

const md = createMarkdownProcessor({ codecs: [emojiCodec] });
describe("表情 codec 拆包", () => {
  it.each([
    [
      {
        type: "emoji",
        emoji: "smile",
        nativeEmoji: "😊",
        children: [{ type: "formatted", text: "" }],
      },
      "😊",
    ],
    [{ type: "emoji", emoji: "smile", children: [{ type: "formatted", text: "" }] }, "smile"],
  ])("保留 nativeEmoji 与旧 id 回落", (element, source) => {
    expect(md.getMarkdown([element] as never).trim()).toBe(source);
    expect(md.getMarkdownWithPositions([element] as never).markdown.trim()).toBe(source);
  });
});
