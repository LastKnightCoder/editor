/** 桌面内置 Markdown 编解码组合，不读取已安装插件的运行时注册表。 */
import { blockquoteCodec } from "@tau/editor/extensions/blockquote/markdown";
import { calloutCodec } from "@tau/editor/extensions/callout/markdown";
import { detailCodec } from "@tau/editor/extensions/detail/markdown";
import { highlightBlockCodec } from "@tau/editor/extensions/highlight-block/markdown";
import { tableMarkdownCodecs } from "@tau/editor/extensions/table/markdown";
import { listMarkdownCodecs } from "@tau/editor/extensions/list/markdown";
import { headerCodec } from "@tau/editor/extensions/header/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { linkCodec } from "@tau/editor/extensions/link/markdown";
import { bookmarkCodec } from "@tau/editor/extensions/bookmark/markdown";
import { annotationCodec } from "@tau/editor/extensions/annotation/markdown";
import { kbdCodec } from "@tau/editor/extensions/kbd/markdown";
import { divideLineCodec } from "@tau/editor/extensions/divide-line/markdown";
import { frontMatterCodec } from "@tau/editor/extensions/front-matter/markdown";
import { mediaMarkdownCodecs } from "@tau/editor/extensions/media/markdown";
import { underlineCodec } from "@tau/editor/extensions/underline/markdown";
import { styledTextCodec } from "@tau/editor/extensions/styled-text/markdown";
import { diagramMarkdownCodecs } from "@tau/editor/extensions/diagram/markdown";
import { codeBlockV2Codec as codeBlockCodec } from "@tau/editor/extensions/code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor/extensions/math/markdown";
import { emojiCodec } from "@tau/editor/extensions/emoji/markdown";
import { webviewCodec } from "@tau/editor/extensions/webview/markdown";
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
  bookmarkCodec,
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
