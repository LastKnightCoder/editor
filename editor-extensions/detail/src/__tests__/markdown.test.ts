import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { detailCodec } from "../markdown";

it("独立 codec 保留容器字段、段落与位置映射", () => {
  const processor = createMarkdownProcessor({ codecs: [...editorMarkdownCodecs, detailCodec] });
  const source = ':::detail{title="说明" open=true}\n正文\n:::';
  const value = processor.importFromMarkdown(source);
  expect(value[0]).toMatchObject({ type: "detail", title: "说明", open: true });
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
      mdLine: 1,
      mdCh: 0,
      mdLength: 2,
    })
  );
});
