import { blockquoteCodec } from "@tau/editor-blockquote/markdown";
import { calloutCodec } from "@tau/editor-callout/markdown";
import { detailCodec } from "@tau/editor-detail/markdown";
import { highlightBlockCodec } from "@tau/editor-highlight-block/markdown";
import { tableMarkdownCodecs } from "@tau/editor-table/markdown";
import { listMarkdownCodecs } from "@tau/editor-list/markdown";
import { headerCodec } from "@tau/editor-header/markdown";
import { createPluginMarkdownProcessor } from "@tau/plugins/content";
import { contentPlugins } from "./contentPlugins.ts";
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
import { markdownCustomDirectives } from "@tau/shared/markdown-directives";

export const mobileCodecComposition = [
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
export const mobileMarkdown = createPluginMarkdownProcessor(
  {
    codecs: mobileCodecComposition,
    textCodecs: [textFormattingCodec],
  },
  contentPlugins
);

export const mobileImportFromMarkdown = (
  markdown: string,
  ignoreTypes?: string[],
  options?: Parameters<typeof mobileMarkdown.importFromMarkdown>[2]
) =>
  mobileMarkdown.importFromMarkdown(markdown, ignoreTypes, {
    customDirectives: { ...markdownCustomDirectives, ...options?.customDirectives },
  });
