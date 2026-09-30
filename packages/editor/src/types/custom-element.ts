import type { ParagraphElement } from "./element/paragraph";
import type { CodeBlockElement } from "./element/code-block";
import type { ImageGalleryElement } from "./element/gallery";
import type { StyledTextElement } from "./element/styled-text";
import type { CalloutElement } from "./element/callout";
import type { HeaderElement } from "./element/header";
import type { BulletedListElement, NumberedListElement, ListItemElement } from "./element/list";
import type { CheckListElement, CheckListItemElement } from "./element/check-list";
import type { MermaidElement } from "./element/mermaid";
import type { TikzElement } from "./element/tikz";
import type { TypstElement } from "./element/typst";
import type { InlineMathElement, BlockMathElement } from "./element/math";
import type { TableElement, TableRowElement, TableCellElement } from "./element/table";
import type { ImageElement } from "./element/image";
import type { DetailElement } from "./element/detail";
import type { LinkElement } from "./element/link";
import type { BlockquoteElement } from "./element/block-quote";
import type { CustomBlockElement } from "./element/custom-block";
import type { HTMLBlockElement } from "./element/html-block";
import type { HTMLInlineElement } from "./element/html-inline";
import type { DivideLineElement } from "./element/divide-line";
import type { HighlightBlockElement } from "./element/highlight-block";
import type { TabsElement, TabPaneElement } from "./element/tabs";
import type { UnderlineElement } from "./element/underline";
import type { AudioElement } from "./element/audio";
import type { VideoElement } from "./element/video";
import type { CommentElement } from "./element/comment";
import type { FrontMatterElement } from "./element/front-matter";
import type { InlineImageElement } from "./element/inline-image";
import type { KbdElement } from "./element/kbd";
import type { EmojiElement } from "./element/emoji";
import type { AnnotationElement } from "./element/annotation";
import type { AbcElement } from "./element/abc";
import type { PlantUMLElement } from "./element/plantuml";

import type { FormattedText } from "./text";

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
  "custom-block": CustomBlockElement;
  "divide-line": DivideLineElement;
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
  "html-inline": HTMLInlineElement;
  "inline-image": InlineImageElement;
  kbd: KbdElement;
  emoji: EmojiElement;
  annotation: AnnotationElement;
  abc: AbcElement;
  plantuml: PlantUMLElement;
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
