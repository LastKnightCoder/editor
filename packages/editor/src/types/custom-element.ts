import type { ParagraphElement } from "./element/paragraph";
import type { ImageGalleryElement } from "./element/gallery";
import type { StyledTextElement } from "./element/styled-text";
import type { CalloutElement } from "./element/callout";
import type { HeaderElement } from "./element/header";
import type { BulletedListElement, NumberedListElement, ListItemElement } from "./element/list";
import type { CheckListElement, CheckListItemElement } from "./element/check-list";
import type { TableElement, TableRowElement, TableCellElement } from "./element/table";
import type { ImageElement } from "./element/image";
import type { DetailElement } from "./element/detail";
import type { LinkElement } from "./element/link";
import type { BlockquoteElement } from "./element/block-quote";
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

import type { FormattedText } from "./text";
import type { ExtensionElementMap, ExtensionInlineElementMap } from "../../api";

declare const __externalElementMapBrand: unique symbol;
declare const __externalInlineElementMapBrand: unique symbol;

export interface BuiltinElementMap {
  paragraph: ParagraphElement;
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
  "check-list-item": CheckListItemElement;
  "check-list": CheckListElement;
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
  "inline-image": InlineImageElement;
  kbd: KbdElement;
  emoji: EmojiElement;
  annotation: AnnotationElement;
}

export interface ExternalElementMap {
  [__externalElementMapBrand]: never;
}

export type CustomElement = (BuiltinElementMap &
  ExternalElementMap &
  ExtensionElementMap)[keyof (BuiltinElementMap & ExternalElementMap & ExtensionElementMap)];

export interface BuiltinInlineElementMap {
  link: LinkElement;
  underline: UnderlineElement;
  "styled-text": StyledTextElement;
  "inline-image": InlineImageElement;
  kbd: KbdElement;
  emoji: EmojiElement;
  annotation: AnnotationElement;
}

export interface ExternalInlineElementMap {
  [__externalInlineElementMapBrand]: never;
}

export type InlineElement = (BuiltinInlineElementMap &
  ExternalInlineElementMap &
  ExtensionInlineElementMap)[keyof (BuiltinInlineElementMap &
  ExternalInlineElementMap &
  ExtensionInlineElementMap)];

export type CustomText = FormattedText;
export type BlockElement = Exclude<CustomElement, InlineElement>;
