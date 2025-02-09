import ParagraphExtension from "./paragraph";
import UnderlineExtension from "./underline";
import HeaderExtension from "./header";
import ImageExtension from "./image";
import ImageGalleryExtension from "./image-gallary";
import BulletedListExtension from "./bulleted-list";
import NumberedListExtension from "./numbered-list";
import { CheckListExtension, CheckListItemExtension } from "./check-list";
import ListItemExtension from "./list-item";
import CodeBlockExtension from "./code-block";
import CalloutExtension from "./callout";
import DetailExtension from "./detail";
import { InlineMathExtension, BlockMathExtension } from './math';
import BlockquoteExtension from "./blockquote";
import LinkExtension from './link';
import DivideLineExtension from "./divide-line";
import MermaidExtension from "./mermaid";
import { TableExtension, TableRowExtension, TableCellExtension } from './table';
import HtmlBlockExtension from "./html-block";
import TikzExtension from "./tikz";
import CustomBlockExtension from "./custom-block";
// import GraphvizExtension from "./graphviz";
import { MultiColumnsContainerExtension, MultiColumnItemExtension } from './multi-column-layout';
import HighlightBlockExtension from "./highlight-block";
import TabsExtension from "./tabs";
import StyledTextExtension from "./styled-text";
import AudioExtension from "./audio";
import VideoExtension from "./video";
// import AIExtension from "./ai";

export const paragraph = new ParagraphExtension();
export const underline = new UnderlineExtension();
export const header = new HeaderExtension();
export const image = new ImageExtension();
export const imageGallery = new ImageGalleryExtension();
export const bulletedList = new BulletedListExtension();
export const numberedList = new NumberedListExtension();
export const checkList = new CheckListExtension();
export const checkListItem = new CheckListItemExtension();
export const listItem = new ListItemExtension();
export const codeBlock = new CodeBlockExtension();
export const detail = new DetailExtension();
export const inlineMath = new InlineMathExtension();
export const blockMath = new BlockMathExtension();
export const blockquote = new BlockquoteExtension();
export const callout = new CalloutExtension();
export const link = new LinkExtension();
export const divideLine = new DivideLineExtension();
export const mermaid = new MermaidExtension();
export const htmlBlock = new HtmlBlockExtension();
export const table = new TableExtension();
export const tableRow = new TableRowExtension();
export const tableCell = new TableCellExtension();
export const tikz = new TikzExtension();

export const customBlock = new CustomBlockExtension();
// export const graphviz = new GraphvizExtension();

export const multiColumnContainer = new MultiColumnsContainerExtension();
export const multiColumnItem = new MultiColumnItemExtension();

export const highlightBlock = new HighlightBlockExtension();
export const tabs = new TabsExtension();
export const styledText = new StyledTextExtension();
export const audio = new AudioExtension();
export const video = new VideoExtension();
// export const ai = new AIExtension();

export const startExtensions = [
  // ai,
  paragraph,
  underline,
  header,
  image,
  imageGallery,
  bulletedList,
  checkList,
  checkListItem,
  numberedList,
  listItem,
  codeBlock,
  tabs,
  detail,
  highlightBlock,
  inlineMath,
  blockMath,
  blockquote,
  callout,
  link,
  divideLine,
  mermaid,
  htmlBlock,
  table,
  tableRow,
  tableCell,
  tikz,
  customBlock,
  // graphviz,
  multiColumnContainer,
  multiColumnItem,
  styledText,
  audio,
  video,
];
