import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { frontMatterCodec } from "../markdown";

it("Front Matter 独立 codec 保留原始 YAML 与元素位置", () => {
  const processor = createMarkdownProcessor({ codecs: [frontMatterCodec] });
  const markdown = "---\nname: demo\ndescription: 说明\ntags:\n  - one\n---";
  const value = processor.importFromMarkdown(markdown);
  expect(value[0]).toMatchObject({
    type: "front-matter",
    value: "name: demo\ndescription: 说明\ntags:\n  - one",
  });
  expect(processor.getMarkdown(value).trim()).toBe(markdown);
  const positioned = processor.importFromMarkdownWithPositions(markdown);
  expect(positioned.content).toEqual(value);
  expect(positioned.positionMap.getElementMappingBySlatePath([0])?.elementType).toBe(
    "front-matter"
  );
});
