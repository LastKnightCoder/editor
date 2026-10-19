import type { BlockElement } from "@tau/editor/api";

import type { Color } from "./variants";
export type { Color } from "./variants";

export interface HighlightBlockElement {
  type: "highlight-block";
  children: BlockElement[];
  color: Color;
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
export type { FormattedText } from "@tau/markdown/model";
