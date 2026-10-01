import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { blockquoteCodec } from "../markdown";

it("独立 codec 保留容器字段、段落与位置映射", () => {
  const processor = createMarkdownProcessor({ codecs: [...editorMarkdownCodecs, blockquoteCodec] });
  const source = "> 正文";
  const value = processor.importFromMarkdown(source);
  expect(value[0]).toMatchObject({ type: "blockquote" });
  expect(value[0]).toMatchObject({
    children: [{ type: "paragraph", children: [{ text: "正文" }] }],
  });
  expect(processor.importFromMarkdown(processor.getMarkdown(value))).toEqual(value);
  const positioned = processor.importFromMarkdownWithPositions(source);
  expect(positioned.content).toEqual(value);
  expect(positioned.positionMap.getMappings()).toContainEqual(
    expect.objectContaining({
      type: "text",
      slateTextPath: [0, 0, 0],
      slateOffset: 0,
      slateLength: 2,
      mdLine: 0,
      mdCh: 2,
      mdLength: 2,
    })
  );
});
