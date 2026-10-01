import { blockquoteCodec } from "@tau/editor-blockquote/markdown";
import { calloutCodec } from "@tau/editor-callout/markdown";
import { detailCodec } from "@tau/editor-detail/markdown";
import { highlightBlockCodec } from "@tau/editor-highlight-block/markdown";
import { tableMarkdownCodecs } from "@tau/editor-table/markdown";
import { listMarkdownCodecs } from "@tau/editor-list/markdown";
import { headerCodec } from "@tau/editor-header/markdown";
/**
 * Desktop 的 Markdown 处理器：内置扩展（@tau/editor/markdown）+ webview + desktop 业务元素
 * （markdown-codecs.ts）的 codec 合成一次（01 §8.2）。渲染进程与 Electron 主进程都从这里取，
 * 保证两边解析规则一致。
 */
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { linkCodec } from "@tau/editor-link/markdown";
import { annotationCodec } from "@tau/editor-annotation/markdown";
import { kbdCodec } from "@tau/editor-kbd/markdown";
import { divideLineCodec } from "@tau/editor-divide-line/markdown";
import { frontMatterCodec } from "@tau/editor-front-matter/markdown";
import { mediaMarkdownCodecs } from "@tau/editor-media/markdown";
import { underlineCodec } from "@tau/editor-underline/markdown";
import { styledTextCodec } from "@tau/editor-styled-text/markdown";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";
import { customBlockCodec } from "@tau/editor-custom-block/markdown";
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { htmlMarkdownCodecs } from "@tau/editor-html/markdown";
import { codeBlockCodec } from "@tau/editor-code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor-math/markdown";
import { emojiCodec } from "@tau/editor-emoji/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";
import { desktopMarkdownCodecs } from "./markdown-codecs.ts";

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
  ...htmlMarkdownCodecs,
  ...diagramMarkdownCodecs,
  customBlockCodec,
  webviewCodec,
  ...desktopMarkdownCodecs,
];
export const desktopMarkdown = createMarkdownProcessor({
  codecs: desktopCodecComposition,
  textCodecs: [textFormattingCodec],
});

export const importFromMarkdown = desktopMarkdown.importFromMarkdown;
export const importFromMarkdownWithPositions = desktopMarkdown.importFromMarkdownWithPositions;
export const getMarkdown = desktopMarkdown.getMarkdown;
export const getMarkdownWithPositions = desktopMarkdown.getMarkdownWithPositions;
export const elementToMarkdown = desktopMarkdown.elementToMarkdown;

export const leafToMarkdown = desktopMarkdown.leafToMarkdown;
export const leafToMarkdownStructured = desktopMarkdown.leafToMarkdownStructured;
export { type SlateWithPositions, type MarkdownWithPositions } from "@tau/markdown";
