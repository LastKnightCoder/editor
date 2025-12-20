import { ParagraphElement } from "./element/paragraph";
import { CodeBlockElement } from "./element/code-block";
import { ImageGalleryElement } from "./element/gallery";
import { StyledTextElement } from "./element/styled-text";
import { CalloutElement } from "./element/callout";
import { HeaderElement } from "./element/header";
import {
  BulletedListElement,
  NumberedListElement,
  ListItemElement,
} from "./element/list";
import { CheckListElement, CheckListItemElement } from "./element/check-list";
import { MermaidElement } from "./element/mermaid";
import { TikzElement } from "./element/tikz";
import { TypstElement } from "./element/typst";
import { InlineMathElement, BlockMathElement } from "./element/math";
import {
  TableElement,
  TableRowElement,
  TableCellElement,
} from "./element/table";
import { ImageElement } from "./element/image";
import { DetailElement } from "./element/detail";
import { LinkElement } from "./element/link";
import { BlockquoteElement } from "./element/block-quote";
import { GraphvizElement } from "./element/graphviz";
import { CustomBlockElement } from "./element/custom-block";
import { HTMLBlockElement } from "./element/html-block";
import { HTMLInlineElement } from "./element/html-inline";
import { DivideLineElement } from "./element/divide-line";
import {
  MultiColumnItemElement,
  MultiColumnContainerElement,
} from "./element/multi-column";
import { HighlightBlockElement } from "./element/highlight-block";
import { TabsElement } from "./element/tabs";
import { UnderlineElement } from "./element/underline";
import { AudioElement } from "./element/audio";
import { VideoElement } from "./element/video";
import { AIElement } from "./element/ai";
import { WhiteboardElement } from "./element/whiteboard";
import { CommentElement } from "./element/comment";
import { FrontMatterElement } from "./element/front-matter";
import { WebviewElement } from "./element/webview";
import { InlineImageElement } from "./element/inline-image";
import { EmojiElement } from "./element/emoji";
import { AnnotationElement } from "./element/annotation";
import { DatabaseElement } from "./element/database";
import { ChatReferenceElement } from "./element/chat-reference";
import { AbcElement } from "./element/abc";
import { PlantUMLElement } from "./element/plantuml";
import { FlashcardBlankElement } from "./element/flashcard-blank";
import { ChartElement } from "./element/chart";

import { FormattedText } from "./text";

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
  | TypstElement
  | HTMLBlockElement
  | GraphvizElement
  | CustomBlockElement
  | DivideLineElement
  | MultiColumnContainerElement
  | MultiColumnItemElement
  | HighlightBlockElement
  | ImageGalleryElement
  | TabsElement
  | UnderlineElement
  | StyledTextElement
  | AudioElement
  | VideoElement
  | AIElement
  | WhiteboardElement
  | CommentElement
  | FrontMatterElement
  | WebviewElement
  | HTMLInlineElement
  | InlineImageElement
  | EmojiElement
  | AnnotationElement
  | DatabaseElement
  | ChatReferenceElement
  | AbcElement
  | PlantUMLElement
  | FlashcardBlankElement
  | ChartElement;

export type InlineElement =
  | LinkElement
  | InlineMathElement
  | UnderlineElement
  | StyledTextElement
  | HTMLInlineElement
  | InlineImageElement
  | EmojiElement
  | AnnotationElement
  | FlashcardBlankElement;

export type CustomText = FormattedText;
export type BlockElement = Exclude<CustomElement, InlineElement>;
