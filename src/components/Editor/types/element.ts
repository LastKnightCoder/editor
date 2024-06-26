import { Descendant } from "slate";
import { FormattedText } from "./text";

export type InlineElement = FormattedText | LinkElement | InlineMathElement | UnderlineElement;
export type CustomElement =
  | ParagraphElement
  | CodeBlockElement
  | CalloutElement
  | HeaderElement
  | BulletedListElement
  | NumberedListElement
  | ListItemElement
  | ImageElement
  | DetailElement
  | BlockquoteElement
  | LinkElement
  | TableElement
  | TableRowElement
  | TableCellElement
  | InlineMathElement
  | BlockMathElement
  | CheckListItemElement
  | CheckListElement
  | MermaidElement
  | TikzElement
  | HTMLBlockElement
  | GraphvizElement
  | CustomBlockElement
  | DivideLineElement
  | MultiColumnContainerElement
  | MultiColumnItemElement
  | HighlightBlockElement
  | ImageGalleryElement
  | TabsElement
  | UnderlineElement;

export type CustomText = FormattedText;
export type BlockElement = Exclude<CustomElement, InlineElement>

export interface ParagraphElement {
  type: 'paragraph';
  children: InlineElement[];
}

export interface CodeBlockElement {
  type: 'code-block';
  language: string;
  code: string;
  uuid: string;
  children: Descendant[];
}

export interface CalloutElement {
  type: 'callout';
  calloutType: 'tip' | 'warning' | 'info' | 'danger' | 'note';
  title: string;
  children: BlockElement[];
}

export interface HeaderElement {
  type: 'header';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: Descendant[];
}

export interface ListItemElement {
  type: 'list-item';
  children: BlockElement[];
  isFold?: boolean;
  allContent?: BlockElement[];
}

export interface BulletedListElement {
  type: 'bulleted-list';
  children: ListItemElement[];
}

export interface NumberedListElement {
  type: 'numbered-list';
  children: ListItemElement[];
}

export interface ImageElement {
  type: 'image';
  url: string;
  alt?: string;
  pasteUploading?: boolean;
  children: Descendant[];
}

export interface DetailElement {
  type: 'detail';
  title: string;
  open?: boolean;
  children: BlockElement[];
}

export interface BlockquoteElement {
  type: 'blockquote';
  children: BlockElement[];
}

export interface LinkElement {
  type: 'link';
  url: string;
  openEdit?: boolean;
  children: FormattedText[];
}

export interface TableCellElement {
  type: 'table-cell';
  children: InlineElement[];
}

export interface TableRowElement {
  type: 'table-row';
  children: TableCellElement[];
}

export interface TableElement {
  type: 'table';
  children: TableRowElement[];
}

export interface InlineMathElement {
  type: 'inline-math';
  tex: string;
  children: FormattedText[];
}

export interface BlockMathElement {
  type: 'block-math';
  tex: string;
  children: Descendant[];
}

export interface CheckListItemElement {
  type: 'check-list-item';
  checked: boolean;
  children: BlockElement[];
}

export interface CheckListElement {
  type: 'check-list';
  children: CheckListItemElement[];
}

export interface MermaidElement {
  type: 'mermaid';
  chart: string;
  children: Descendant[];
}

export interface TikzElement {
  type: 'tikz';
  content: string;
  children: Descendant[];
}

export interface HTMLBlockElement {
  type: 'html-block';
  html: string;
  children: Descendant[];
}

export interface GraphvizElement {
  type: 'graphviz',
  dot: string;
  children: Descendant[];
}

export interface CustomBlockElement {
  type: 'custom-block';
  content: string;
  children: Descendant[];
}

export interface DivideLineElement {
  type: 'divide-line';
  children: Descendant[];
}

export interface MultiColumnContainerElement {
  type:'multi-column-container';
  children: MultiColumnItemElement[];
}

export interface MultiColumnItemElement {
  type:'multi-column-item';
  width?: number;
  children: BlockElement[];
}

export type Color = 'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'purple';

export interface HighlightBlockElement {
  type: 'highlight-block',
  children: BlockElement[];
  color: Color;
}

export interface ImageGalleryItem {
  id: string;
  url: string;
  desc?: string;
}

export enum EGalleryMode {
  Horizontal = 1,
  Vertical,
  Inline,
}

export interface ImageGalleryElement {
  type: 'image-gallery';
  mode: EGalleryMode;
  height?: number;
  images: ImageGalleryItem[];
  wider?: boolean;
  columnCount?: number;
  children: Descendant[];
}

export interface ITabsContent {
  key: string;
  title: string;
  content: Descendant[];
}

export interface TabsElement {
  type: 'tabs';
  activeKey: string;
  tabsContent: ITabsContent[];
  children: BlockElement[];
}

export interface UnderlineElement {
  type: 'underline',
  color: string;
  lineType: string;
  colorSelectOpen: boolean;
  children: FormattedText[];
}
