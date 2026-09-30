import type { AnyExtension } from "../api/legacy";
import ParagraphExtension from "./paragraph";
import UnderlineExtension from "./underline";
import headerExtension from "./header";
import ImageExtension from "./image";
import ImageGalleryExtension from "./image-gallary";
import bulletedListExtension from "./bulleted-list";
import numberedListExtension from "./numbered-list";
import { checkListExtension, checkListItemExtension } from "./check-list";
import listItemExtension from "./list-item";
import codeBlockExtension from "./code-block";
import calloutExtension from "./callout";
import detailExtension from "./detail";
import { InlineMathExtension, BlockMathExtension } from "./math";
import blockquoteExtension from "./blockquote";
import LinkExtension from "./link";
import CommentExtension from "./comment";
import divideLineExtension from "./divide-line";
import MermaidExtension from "./mermaid";
import { tableExtension, tableRowExtension, tableCellExtension } from "./table";
import HtmlBlockExtension from "./html-block";
import TikzExtension from "./tikz";
import TypstExtension from "./typst";
import customBlockExtension from "./custom-block";
import { MultiColumnsContainerExtension, MultiColumnItemExtension } from "./multi-column-layout";
import highlightBlockExtension from "./highlight-block";
import tabsExtension, { tabPaneExtension } from "./tabs";
import StyledTextExtension from "./styled-text";
import audioExtension from "./audio";
import videoExtension from "./video";
import FrontMatterExtension from "./front-matter";
import InlineHtmlExtension from "./html-inline";
import InlineImageExtension from "./inline-image";
import KbdExtension from "./kbd";
import EmojiExtension from "./emoji";
import AnnotationExtension from "./annotation";
import AbcExtension from "./abc";
import PlantUMLExtension from "./plantuml";
import ChartExtension from "./chart";
import { defaultMenuExtension } from "../menu/defaultMenu";
import { previewMenuExtension } from "../components/PreviewWithEditor/menu";

export const paragraph = new ParagraphExtension();
export const underline = new UnderlineExtension();
export const header = headerExtension;
export const image = new ImageExtension();
export const imageGallery = new ImageGalleryExtension();
export const bulletedList = bulletedListExtension;
export const numberedList = numberedListExtension;
export const checkList = checkListExtension;
export const checkListItem = checkListItemExtension;
export const listItem = listItemExtension;
export const codeBlock = codeBlockExtension;
export const detail = detailExtension;
export const inlineMath = new InlineMathExtension();
export const blockMath = new BlockMathExtension();
export const blockquote = blockquoteExtension;
export const callout = calloutExtension;
export const link = new LinkExtension();
export const comment = new CommentExtension();
export const divideLine = divideLineExtension;
export const mermaid = new MermaidExtension();
export const htmlBlock = new HtmlBlockExtension();
export const table = tableExtension;
export const tableRow = tableRowExtension;
export const tableCell = tableCellExtension;
export const tikz = new TikzExtension();
export const typst = new TypstExtension();
export const frontMatter = new FrontMatterExtension();

export const customBlock = customBlockExtension;

export const multiColumnContainer = new MultiColumnsContainerExtension();
export const multiColumnItem = new MultiColumnItemExtension();

export const highlightBlock = highlightBlockExtension;
export const tabs = tabsExtension;
export const tabPane = tabPaneExtension;
export const styledText = new StyledTextExtension();
export const audio = audioExtension;
export const video = videoExtension;
export const htmlInline = new InlineHtmlExtension();
export const inlineImage = new InlineImageExtension();
export const kbd = new KbdExtension();
export const emoji = new EmojiExtension();
export const annotation = new AnnotationExtension();
export const abc = new AbcExtension();
export const plantuml = new PlantUMLExtension();
export const chart = new ChartExtension();

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
  multiColumnContainer,
  multiColumnItem,
  styledText,
  audio,
  video,
  frontMatter,
  emoji,
  annotation,
  abc,
  plantuml,
  chart,
];
