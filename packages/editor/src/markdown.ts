/**
 * `@tau/editor/markdown`：内置扩展的 Markdown codec 列表（01 §8.2）。
 *
 * headless 入口：只聚合各扩展的 markdown.ts（纯函数文件，只 import 类型和 @tau/markdown），
 * 不经 `src/index.ts`，避免带出 React 组件；Electron 主进程、脚本可经 type stripping 直接加载
 * （有 node-import 测试守护）。宿主把它与自己的业务 codec 合成一次交给 createMarkdownProcessor，
 * kit 与主进程共用。webview 的 codec 在 `@tau/editor-webview/markdown`（独立包）。
 */
import type { MarkdownCodec } from "@tau/markdown";

import { paragraphCodec } from "./extensions/paragraph/markdown.ts";
import { headerCodec } from "./extensions/header/markdown.ts";
import { linkCodec } from "./extensions/link/markdown.ts";
import { codeBlockCodec } from "./extensions/code-block/markdown.ts";
import { blockquoteCodec } from "./extensions/blockquote/markdown.ts";
import { imageCodec } from "./extensions/image/markdown.ts";
import { inlineImageCodec } from "./extensions/inline-image/markdown.ts";
import { imageGalleryCodec } from "./extensions/image-gallary/markdown.ts";
import { blockMathCodec, inlineMathCodec } from "./extensions/math/markdown.ts";
import { htmlBlockCodec } from "./extensions/html-block/markdown.ts";
import { htmlInlineCodec } from "./extensions/html-inline/markdown.ts";
import { bulletedListCodec } from "./extensions/bulleted-list/markdown.ts";
import { numberedListCodec } from "./extensions/numbered-list/markdown.ts";
import { listItemCodec } from "./extensions/list-item/markdown.ts";
import { tableCodec, tableRowCodec, tableCellCodec } from "./extensions/table/markdown.ts";
import { mermaidCodec } from "./extensions/mermaid/markdown.ts";
import { abcCodec } from "./extensions/abc/markdown.ts";
import { plantumlCodec } from "./extensions/plantuml/markdown.ts";
import { tikzCodec } from "./extensions/tikz/markdown.ts";
import { typstCodec } from "./extensions/typst/markdown.ts";
import { calloutCodec } from "./extensions/callout/markdown.ts";
import { detailCodec } from "./extensions/detail/markdown.ts";
import { divideLineCodec } from "./extensions/divide-line/markdown.ts";
import { videoCodec } from "./extensions/video/markdown.ts";
import { audioCodec } from "./extensions/audio/markdown.ts";
import { checkListCodec, checkListItemCodec } from "./extensions/check-list/markdown.ts";
import { highlightBlockCodec } from "./extensions/highlight-block/markdown.ts";
import { customBlockCodec } from "./extensions/custom-block/markdown.ts";
import { frontMatterCodec } from "./extensions/front-matter/markdown.ts";
import { emojiCodec } from "./extensions/emoji/markdown.ts";
import { annotationCodec } from "./extensions/annotation/markdown.ts";
import { styledTextCodec } from "./extensions/styled-text/markdown.ts";
import { kbdCodec } from "./extensions/kbd/markdown.ts";
import { underlineCodec } from "./extensions/underline/markdown.ts";

export const editorMarkdownCodecs: MarkdownCodec[] = [
  paragraphCodec,
  headerCodec,
  linkCodec,
  codeBlockCodec,
  blockquoteCodec,
  imageCodec,
  inlineImageCodec,
  imageGalleryCodec,
  blockMathCodec,
  inlineMathCodec,
  htmlBlockCodec,
  htmlInlineCodec,
  bulletedListCodec,
  numberedListCodec,
  listItemCodec,
  tableCodec,
  tableRowCodec,
  tableCellCodec,
  mermaidCodec,
  abcCodec,
  plantumlCodec,
  tikzCodec,
  typstCodec,
  calloutCodec,
  detailCodec,
  divideLineCodec,
  videoCodec,
  audioCodec,
  checkListCodec,
  checkListItemCodec,
  highlightBlockCodec,
  customBlockCodec,
  frontMatterCodec,
  emojiCodec,
  annotationCodec,
  styledTextCodec,
  kbdCodec,
  underlineCodec,
];
