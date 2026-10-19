import type { BlockElement } from "@tau/editor/api";

export interface DetailElement {
  type: "detail";
  title: string;
  open?: boolean;
  children: BlockElement[];
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
export type { FormattedText } from "@tau/markdown/model";
