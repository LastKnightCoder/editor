import { blockquoteCodec } from "@tau/editor/extensions/blockquote/markdown";
import { calloutCodec } from "@tau/editor/extensions/callout/markdown";
import { detailCodec } from "@tau/editor/extensions/detail/markdown";
import { highlightBlockCodec } from "@tau/editor/extensions/highlight-block/markdown";
import { tableMarkdownCodecs } from "@tau/editor/extensions/table/markdown";
import { listMarkdownCodecs } from "@tau/editor/extensions/list/markdown";
import { headerCodec } from "@tau/editor/extensions/header/markdown";
/**
 * Desktop 的 Markdown 处理器：内置扩展（@tau/editor/markdown）+ webview + desktop 业务元素
 * （markdown-codecs.ts）的 codec 合成一次（01 §8.2）。渲染进程与 Electron 主进程都从这里取，
 * 保证两边解析规则一致。
 */
import { createPluginMarkdownProcessor } from "@tau/plugins/content";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { linkCodec } from "@tau/editor/extensions/link/markdown";
import { annotationCodec } from "@tau/editor/extensions/annotation/markdown";
import { kbdCodec } from "@tau/editor/extensions/kbd/markdown";
import { divideLineCodec } from "@tau/editor/extensions/divide-line/markdown";
import { frontMatterCodec } from "@tau/editor/extensions/front-matter/markdown";
import { mediaMarkdownCodecs } from "@tau/editor/extensions/media/markdown";
import { underlineCodec } from "@tau/editor/extensions/underline/markdown";
import { styledTextCodec } from "@tau/editor/extensions/styled-text/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { diagramMarkdownCodecs } from "@tau/editor/extensions/diagram/markdown";
import { codeBlockCodec } from "@tau/editor/extensions/code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor/extensions/math/markdown";
import { emojiCodec } from "@tau/editor/extensions/emoji/markdown";
import { webviewCodec } from "@tau/editor/extensions/webview/markdown";
import { desktopMarkdownCodecs } from "./markdown-codecs.ts";
import { desktopContentPlugins } from "../../shared/content-plugins.ts";

export const desktopCodecComposition = [
  ...editorMarkdownCodecs,
  blockquoteCodec,
  calloutCodec,
  detailCodec,
  highlightBlockCodec,
  ...tableMarkdownCodecs,
  ...listMarkdownCodecs,
  headerCodec,
  linkCodec,
  annotationCodec,
  kbdCodec,
  divideLineCodec,
  frontMatterCodec,
  ...mediaMarkdownCodecs,
  underlineCodec,
  styledTextCodec,
  emojiCodec,
  codeBlockCodec,
  ...mathMarkdownCodecs,
  ...diagramMarkdownCodecs,
  webviewCodec,
  ...desktopMarkdownCodecs,
];
export const desktopMarkdown = createPluginMarkdownProcessor(
  {
    codecs: desktopCodecComposition,
    textCodecs: [textFormattingCodec],
  },
  desktopContentPlugins
);

export const importFromMarkdown = desktopMarkdown.importFromMarkdown;
export const importFromMarkdownWithPositions = desktopMarkdown.importFromMarkdownWithPositions;
export const getMarkdown = desktopMarkdown.getMarkdown;
export const getMarkdownWithPositions = desktopMarkdown.getMarkdownWithPositions;
export const elementToMarkdown = desktopMarkdown.elementToMarkdown;

export const leafToMarkdown = desktopMarkdown.leafToMarkdown;
export const leafToMarkdownStructured = desktopMarkdown.leafToMarkdownStructured;
export { type SlateWithPositions, type MarkdownWithPositions } from "@tau/markdown";
