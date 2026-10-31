import type { EditorExtension } from "../../api";
import blockquote from "../extensions/blockquote/src";
import callout from "../extensions/callout/src";
import detail from "../extensions/detail/src";
import highlightBlock from "../extensions/highlight-block/src";
import { defaultMenuExtension } from "../core/menu/defaultMenu";
import { textFormattingExtension } from "../extensions/text-formatting/src";
import { tabsExtensions } from "../extensions/tabs/src";
import header from "../extensions/header/src";
import { tableExtensions } from "../extensions/table/src";
import { listExtensions } from "../extensions/list/src";
import { default as link } from "../extensions/link/src";
import { default as bookmark } from "../extensions/bookmark/src";
import { default as comment } from "../extensions/comment/src";
import { default as divideLine } from "../extensions/divide-line/src";
import { default as kbd } from "../extensions/kbd/src";
import { default as frontMatter } from "../extensions/front-matter/src";
import { default as annotation } from "../extensions/annotation/src";
import { default as underline } from "../extensions/underline/src";
import { default as styledText } from "../extensions/styled-text/src";
import { image, inlineImage, audio, video, mediaUiExtension } from "../extensions/media/src";

/** 产品的显式扩展组合，顺序保持原场景；核心不得依赖此模块。 */
export const standardExtensions: readonly EditorExtension[] = [
  defaultMenuExtension,
  underline,
  header,
  image,
  inlineImage,
  ...listExtensions,
  ...tabsExtensions,
  detail,
  highlightBlock,
  blockquote,
  callout,
  // 须在链接之前：空段落的网址粘贴先由书签认领
  bookmark,
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
