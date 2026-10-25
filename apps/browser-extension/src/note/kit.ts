/**
 * 页面笔记的编辑器组成：Tau 编辑器的基础组件（段落、标题、列表与待办、引用、代码块、链接、分割线、
 * 行内格式与着色、下划线），斜杠菜单与格式工具条；粘贴 Markdown 自动转换。
 * Markdown 处理器只认这些元素，其余语法按编辑器的未知节点兜底保真。
 */
import {
  createEditorKit,
  createMarkdownPasteImportExtension,
  defaultMenuExtension,
  type EditorKit,
} from "@tau/editor";
import blockquote from "@tau/editor/extensions/blockquote";
import codeBlock from "@tau/editor/extensions/code-block";
import divideLine from "@tau/editor/extensions/divide-line";
import header from "@tau/editor/extensions/header";
import link from "@tau/editor/extensions/link";
import { listExtensions } from "@tau/editor/extensions/list";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import underline from "@tau/editor/extensions/underline";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { blockquoteCodec } from "@tau/editor/extensions/blockquote/markdown";
import { codeBlockV2Codec } from "@tau/editor/extensions/code-block/markdown";
import { divideLineCodec } from "@tau/editor/extensions/divide-line/markdown";
import { headerCodec } from "@tau/editor/extensions/header/markdown";
import { linkCodec } from "@tau/editor/extensions/link/markdown";
import { listMarkdownCodecs } from "@tau/editor/extensions/list/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { underlineCodec } from "@tau/editor/extensions/underline/markdown";
import { createMarkdownProcessor } from "@tau/markdown";
import type { Descendant } from "slate";

export const noteMarkdown = createMarkdownProcessor({
  codecs: [
    ...editorMarkdownCodecs,
    headerCodec,
    ...listMarkdownCodecs,
    blockquoteCodec,
    linkCodec,
    divideLineCodec,
    underlineCodec,
    codeBlockV2Codec,
  ],
  textCodecs: [textFormattingCodec],
});

export const markdownToNodes = (markdown: string): Descendant[] =>
  noteMarkdown.importFromMarkdown(markdown);

let kit: EditorKit | null = null;

export function getNoteKit(): EditorKit {
  kit ??= createEditorKit({
    extensions: [
      defaultMenuExtension,
      header,
      ...listExtensions,
      blockquote,
      link,
      divideLine,
      underline,
      codeBlock,
      textFormattingExtension,
      createMarkdownPasteImportExtension(markdownToNodes),
    ],
  });
  return kit;
}
