import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { kbdCodec } from "../markdown";

it("按键标签仅在安装 codec 后生成领域节点，嵌套与大小写匹配保持", () => {
  const bare = createMarkdownProcessor({ codecs: editorMarkdownCodecs });
  const processor = createMarkdownProcessor({ codecs: [...editorMarkdownCodecs, kbdCodec] });
  const markdown = '前 <KBD class="key">Ctrl <kbd>K</kbd></KBD> 后';
  expect(JSON.stringify(bare.importFromMarkdown(markdown))).not.toContain('"type":"kbd"');
  const value = processor.importFromMarkdown(markdown);
  expect(JSON.stringify(value).match(/"type":"kbd"/g)).toHaveLength(2);
  expect(processor.importFromMarkdownWithPositions(markdown).content).toEqual(value);
  expect(processor.importFromMarkdown(processor.getMarkdown(value))).toEqual(value);
});
