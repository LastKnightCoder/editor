import type { BlockElement } from "@tau/editor/api";

import type { CalloutType } from "./variants";
export type { CalloutType } from "./variants";

export interface CalloutElement {
  type: "callout";
  calloutType: CalloutType;
  title: string;
  children: BlockElement[];
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
export type { FormattedText } from "@tau/markdown/model";
