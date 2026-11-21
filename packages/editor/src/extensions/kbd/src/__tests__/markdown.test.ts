import { expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { linkCodec } from "@tau/editor/extensions/link/markdown";
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

it("链接内的按键经 Markdown 与源码位置映射往返后保留", () => {
  const md = createMarkdownProcessor({ codecs: [...editorMarkdownCodecs, kbdCodec, linkCodec] });
  const content = md.importFromMarkdown("[按 <kbd>Enter</kbd>](https://example.com)");
  expect(content[0]).toMatchObject({
    children: [
      {
        type: "link",
        children: [{ text: "按 " }, { type: "kbd", children: [{ text: "Enter" }] }],
      },
    ],
  });
  expect(
    md.importFromMarkdownWithPositions(md.getMarkdownWithPositions(content).markdown).content
  ).toEqual(content);
});
