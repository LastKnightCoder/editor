import type { AnyExtension } from "../api/legacy";
import paragraphExtension from "./paragraph";
import underlineExtension from "./underline";
import headerExtension from "./header";
import imageExtension from "./image";
import imageGalleryExtension from "./image-gallary";
import bulletedListExtension from "./bulleted-list";
import numberedListExtension from "./numbered-list";
import { checkListExtension, checkListItemExtension } from "./check-list";
import listItemExtension from "./list-item";
import calloutExtension from "./callout";
import detailExtension from "./detail";
import blockquoteExtension from "./blockquote";
import linkExtension from "./link";
import commentExtension from "./comment";
import divideLineExtension from "./divide-line";
import { tableExtension, tableRowExtension, tableCellExtension } from "./table";
import highlightBlockExtension from "./highlight-block";
import tabsExtension, { tabPaneExtension } from "./tabs";
import styledTextExtension from "./styled-text";
import audioExtension from "./audio";
import videoExtension from "./video";
import frontMatterExtension from "./front-matter";
import inlineImageExtension from "./inline-image";
import kbdExtension from "./kbd";
import emojiExtension from "./emoji";
import annotationExtension from "./annotation";
import { defaultMenuExtension } from "../menu/defaultMenu";

export const paragraph = paragraphExtension;
export const underline = underlineExtension;
export const header = headerExtension;
export const image = imageExtension;
export const imageGallery = imageGalleryExtension;
export const bulletedList = bulletedListExtension;
export const numberedList = numberedListExtension;
export const checkList = checkListExtension;
export const checkListItem = checkListItemExtension;
export const listItem = listItemExtension;
export const detail = detailExtension;
export const blockquote = blockquoteExtension;
export const callout = calloutExtension;
export const link = linkExtension;
export const comment = commentExtension;
export const divideLine = divideLineExtension;
export const table = tableExtension;
export const tableRow = tableRowExtension;
export const tableCell = tableCellExtension;
export const frontMatter = frontMatterExtension;

export const highlightBlock = highlightBlockExtension;
export const tabs = tabsExtension;
export const tabPane = tabPaneExtension;
export const styledText = styledTextExtension;
export const audio = audioExtension;
export const video = videoExtension;
export const inlineImage = inlineImageExtension;
export const kbd = kbdExtension;
export const emoji = emojiExtension;
export const annotation = annotationExtension;

/** 内置 v2 扩展；独立扩展包由宿主场景 kit 显式组合。 */
export const startExtensions: AnyExtension[] = [
  defaultMenuExtension,
  paragraph,
  underline,
  header,
  image,
  inlineImage,
  imageGallery,
  bulletedList,
  checkList,
  checkListItem,
  numberedList,
  listItem,
  tabs,
  tabPane,
  detail,
  highlightBlock,
  blockquote,
  callout,
  link,
  comment,
  divideLine,
  kbd,
  table,
  tableRow,
  tableCell,
  styledText,
  audio,
  video,
  frontMatter,
  emoji,
  annotation,
];
