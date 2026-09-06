import { ParagraphElement } from "./element/paragraph";
import { CodeBlockElement } from "./element/code-block";
import { ImageGalleryElement } from "./element/gallery";
import { StyledTextElement } from "./element/styled-text";
import { CalloutElement } from "./element/callout";
import { HeaderElement } from "./element/header";
import { BulletedListElement, NumberedListElement, ListItemElement } from "./element/list";
import { CheckListElement, CheckListItemElement } from "./element/check-list";
import { MermaidElement } from "./element/mermaid";
import { TikzElement } from "./element/tikz";
import { TypstElement } from "./element/typst";
import { InlineMathElement, BlockMathElement } from "./element/math";
import { TableElement, TableRowElement, TableCellElement } from "./element/table";
import { ImageElement } from "./element/image";
import { DetailElement } from "./element/detail";
import { LinkElement } from "./element/link";
import { BlockquoteElement } from "./element/block-quote";
import { GraphvizElement } from "./element/graphviz";
import { CustomBlockElement } from "./element/custom-block";
import { HTMLBlockElement } from "./element/html-block";
import { HTMLInlineElement } from "./element/html-inline";
import { DivideLineElement } from "./element/divide-line";
import { MultiColumnItemElement, MultiColumnContainerElement } from "./element/multi-column";
import { HighlightBlockElement } from "./element/highlight-block";
import { TabsElement, TabPaneElement } from "./element/tabs";
import { UnderlineElement } from "./element/underline";
import { AudioElement } from "./element/audio";
import { VideoElement } from "./element/video";
import { CommentElement } from "./element/comment";
import { FrontMatterElement } from "./element/front-matter";
import { WebviewElement } from "./element/webview";
import { InlineImageElement } from "./element/inline-image";
import { KbdElement } from "./element/kbd";
import { EmojiElement } from "./element/emoji";
import { AnnotationElement } from "./element/annotation";
import { AbcElement } from "./element/abc";
import { PlantUMLElement } from "./element/plantuml";
import { ChartElement } from "./element/chart";

import { FormattedText } from "./text";

declare const __externalElementMapBrand: unique symbol;
declare const __externalInlineElementMapBrand: unique symbol;

export interface BuiltinElementMap {
  paragraph: ParagraphElement;
  "code-block": CodeBlockElement;
  callout: CalloutElement;
  header: HeaderElement;
  "bulleted-list": BulletedListElement;
  "numbered-list": NumberedListElement;
  "list-item": ListItemElement;
  image: ImageElement;
  detail: DetailElement;
  blockquote: BlockquoteElement;
  link: LinkElement;
  table: TableElement;
  "table-row": TableRowElement;
  "table-cell": TableCellElement;
  "inline-math": InlineMathElement;
  "block-math": BlockMathElement;
  "check-list-item": CheckListItemElement;
  "check-list": CheckListElement;
  mermaid: MermaidElement;
  tikz: TikzElement;
  typst: TypstElement;
  "html-block": HTMLBlockElement;
  graphviz: GraphvizElement;
  "custom-block": CustomBlockElement;
  "divide-line": DivideLineElement;
  "multi-column-container": MultiColumnContainerElement;
  "multi-column-item": MultiColumnItemElement;
  "highlight-block": HighlightBlockElement;
  "image-gallery": ImageGalleryElement;
  tabs: TabsElement;
  "tab-pane": TabPaneElement;
  underline: UnderlineElement;
  "styled-text": StyledTextElement;
  audio: AudioElement;
  video: VideoElement;
  comment: CommentElement;
  "front-matter": FrontMatterElement;
  webview: WebviewElement;
  "html-inline": HTMLInlineElement;
  "inline-image": InlineImageElement;
  kbd: KbdElement;
  emoji: EmojiElement;
  annotation: AnnotationElement;
  abc: AbcElement;
  plantuml: PlantUMLElement;
  chart: ChartElement;
}

export interface ExternalElementMap {
  [__externalElementMapBrand]: never;
}

export type CustomElement = (BuiltinElementMap & ExternalElementMap)[keyof (BuiltinElementMap &
  ExternalElementMap)];

export interface BuiltinInlineElementMap {
  link: LinkElement;
  "inline-math": InlineMathElement;
  underline: UnderlineElement;
  "styled-text": StyledTextElement;
  "html-inline": HTMLInlineElement;
  "inline-image": InlineImageElement;
  kbd: KbdElement;
  emoji: EmojiElement;
  annotation: AnnotationElement;
}

export interface ExternalInlineElementMap {
  [__externalInlineElementMapBrand]: never;
}

export type InlineElement = (BuiltinInlineElementMap &
  ExternalInlineElementMap)[keyof (BuiltinInlineElementMap & ExternalInlineElementMap)];

export type CustomText = FormattedText;
export type BlockElement = Exclude<CustomElement, InlineElement>;
