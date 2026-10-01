import type { AnyExtension } from "../packages/editor/api";
import blockquote from "./blockquote/src";
import callout from "./callout/src";
import detail from "./detail/src";
import highlightBlock from "./highlight-block/src";
import { defaultMenuExtension } from "../packages/editor";
import { textFormattingExtension } from "./text-formatting/src";
import { tabsExtensions } from "./tabs/src";
import header from "./header/src";
import { tableExtensions } from "./table/src";
import { listExtensions } from "./list/src";
import { default as link } from "./link/src";
import { default as comment } from "./comment/src";
import { default as divideLine } from "./divide-line/src";
import { default as kbd } from "./kbd/src";
import { default as frontMatter } from "./front-matter/src";
import { default as annotation } from "./annotation/src";
import { default as underline } from "./underline/src";
import { default as styledText } from "./styled-text/src";
import { image, inlineImage, imageGallery, audio, video, mediaUiExtension } from "./media/src";

/** 产品的显式扩展组合，顺序保持原场景；核心不得依赖此模块。 */
export const standardExtensions: readonly AnyExtension[] = [
  defaultMenuExtension,
  underline,
  header,
  image,
  inlineImage,
  imageGallery,
  ...listExtensions,
  ...tabsExtensions,
  detail,
  highlightBlock,
  blockquote,
  callout,
  link,
  comment,
  divideLine,
  kbd,
  ...tableExtensions,
  styledText,
  audio,
  video,
  frontMatter,
  annotation,
  textFormattingExtension,
  mediaUiExtension,
];
