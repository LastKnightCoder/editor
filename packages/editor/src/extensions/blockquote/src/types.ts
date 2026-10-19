import type { BlockElement } from "@tau/editor/api";

export interface BlockquoteElement {
  type: "blockquote";
  children: BlockElement[];
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
export type { FormattedText } from "@tau/markdown/model";
