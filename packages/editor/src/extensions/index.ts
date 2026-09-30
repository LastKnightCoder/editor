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
import codeBlockExtension from "./code-block";
import calloutExtension from "./callout";
import detailExtension from "./detail";
import { inlineMathExtension, blockMathExtension } from "./math";
import blockquoteExtension from "./blockquote";
import linkExtension from "./link";
import commentExtension from "./comment";
import divideLineExtension from "./divide-line";
import mermaidExtension from "./mermaid";
import { tableExtension, tableRowExtension, tableCellExtension } from "./table";
import htmlBlockExtension from "./html-block";
import tikzExtension from "./tikz";
import typstExtension from "./typst";
import customBlockExtension from "./custom-block";
import highlightBlockExtension from "./highlight-block";
import tabsExtension, { tabPaneExtension } from "./tabs";
import styledTextExtension from "./styled-text";
import audioExtension from "./audio";
import videoExtension from "./video";
import frontMatterExtension from "./front-matter";
import htmlInlineExtension from "./html-inline";
import inlineImageExtension from "./inline-image";
import kbdExtension from "./kbd";
import emojiExtension from "./emoji";
import annotationExtension from "./annotation";
import abcExtension from "./abc";
import plantUMLExtension from "./plantuml";
import { defaultMenuExtension } from "../menu/defaultMenu";
import { previewMenuExtension } from "../components/PreviewWithEditor/menu";

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
export const codeBlock = codeBlockExtension;
export const detail = detailExtension;
export const inlineMath = inlineMathExtension;
export const blockMath = blockMathExtension;
export const blockquote = blockquoteExtension;
export const callout = calloutExtension;
export const link = linkExtension;
export const comment = commentExtension;
export const divideLine = divideLineExtension;
export const mermaid = mermaidExtension;
export const htmlBlock = htmlBlockExtension;
export const table = tableExtension;
export const tableRow = tableRowExtension;
export const tableCell = tableCellExtension;
export const tikz = tikzExtension;
export const typst = typstExtension;
export const frontMatter = frontMatterExtension;

export const customBlock = customBlockExtension;

export const highlightBlock = highlightBlockExtension;
export const tabs = tabsExtension;
export const tabPane = tabPaneExtension;
export const styledText = styledTextExtension;
export const audio = audioExtension;
export const video = videoExtension;
export const htmlInline = htmlInlineExtension;
export const inlineImage = inlineImageExtension;
export const kbd = kbdExtension;
export const emoji = emojiExtension;
export const annotation = annotationExtension;
export const abc = abcExtension;
export const plantuml = plantUMLExtension;

/** 内置扩展：v2 与旧 IExtension 混排，迁移期间逐个换成 defineExtension */
export const startExtensions: AnyExtension[] = [
  defaultMenuExtension,
  previewMenuExtension,
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
  codeBlock,
  tabs,
  tabPane,
  detail,
  highlightBlock,
  inlineMath,
  blockMath,
  blockquote,
  callout,
  link,
  comment,
  divideLine,
  mermaid,
  htmlBlock,
  htmlInline,
  kbd,
  table,
  tableRow,
  tableCell,
  tikz,
  typst,
  customBlock,
  styledText,
  audio,
  video,
  frontMatter,
  emoji,
  annotation,
  abc,
  plantuml,
];
