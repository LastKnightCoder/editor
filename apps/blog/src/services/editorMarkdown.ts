import { blockquoteCodec } from "@tau/editor-blockquote/markdown";
import { calloutCodec } from "@tau/editor-callout/markdown";
import { detailCodec } from "@tau/editor-detail/markdown";
import { highlightBlockCodec } from "@tau/editor-highlight-block/markdown";
import { tableMarkdownCodecs } from "@tau/editor-table/markdown";
import { listMarkdownCodecs } from "@tau/editor-list/markdown";
import { headerCodec } from "@tau/editor-header/markdown";
import { createPluginMarkdownProcessor } from "@tau/plugins/content";
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
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { htmlMarkdownCodecs } from "@tau/editor-html/markdown";
import { codeBlockCodec } from "@tau/editor-code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor-math/markdown";
import { emojiCodec } from "@tau/editor-emoji/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";
import { publishedContentPlugins } from "./plugin-registry.ts";

/** 发布预览的 codec 组合；与 blog 场景 kit 的元素覆盖一起检查。 */
export const blogCodecComposition = [
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
  webviewCodec,
];
export const blogMarkdown = createPluginMarkdownProcessor(
  {
    codecs: blogCodecComposition,
    textCodecs: [textFormattingCodec],
  },
  publishedContentPlugins
);
