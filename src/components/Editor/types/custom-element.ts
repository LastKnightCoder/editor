import { ParagraphElement } from "./element/paragraph.ts";
import { CodeBlockElement } from "./element/code-block.ts";
import { ImageGalleryElement } from "./element/gallery.ts";
import { StyledTextElement } from "./element/styled-text.ts";
import { CalloutElement } from "./element/callout.ts";
import { HeaderElement } from "./element/header.ts";
import {
  BulletedListElement,
  NumberedListElement,
  ListItemElement,
} from "./element/list.ts";
import {
  CheckListElement,
  CheckListItemElement,
} from "./element/check-list.ts";
import { MermaidElement } from "./element/mermaid.ts";
import { TikzElement } from "./element/tikz.ts";
import { TypstElement } from "./element/typst.ts";
import { InlineMathElement, BlockMathElement } from "./element/math.ts";
import {
  TableElement,
  TableRowElement,
  TableCellElement,
} from "./element/table.ts";
import { ImageElement } from "./element/image.ts";
import { DetailElement } from "./element/detail.ts";
import { LinkElement } from "./element/link.ts";
import { BlockquoteElement } from "./element/block-quote.ts";
import { GraphvizElement } from "./element/graphviz.ts";
import { CustomBlockElement } from "./element/custom-block.ts";
import { HTMLBlockElement } from "./element/html-block.ts";
import { HTMLInlineElement } from "./element/html-inline.ts";
import { DivideLineElement } from "./element/divide-line.ts";
import {
  MultiColumnItemElement,
  MultiColumnContainerElement,
} from "./element/multi-column.ts";
import { HighlightBlockElement } from "./element/highlight-block.ts";
import { TabsElement } from "./element/tabs.ts";
import { UnderlineElement } from "./element/underline.ts";
import { AudioElement } from "./element/audio.ts";
import { VideoElement } from "./element/video.ts";
import { AIElement } from "./element/ai.ts";
import { WhiteboardElement } from "./element/whiteboard.ts";
import { CommentElement } from "./element/comment.ts";
import { FrontMatterElement } from "./element/front-matter.ts";
import { WebviewElement } from "./element/webview.ts";
import { InlineImageElement } from "./element/inline-image.ts";
import { EmojiElement } from "./element/emoji.ts";
import { AnnotationElement } from "./element/annotation.ts";

import { FormattedText } from "./text.ts";

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
  | AnnotationElement;

export type InlineElement =
  | LinkElement
  | InlineMathElement
  | UnderlineElement
  | StyledTextElement
  | HTMLInlineElement
  | InlineImageElement
  | EmojiElement
  | AnnotationElement;

export type CustomText = FormattedText;
export type BlockElement = Exclude<CustomElement, InlineElement>;
