import type { BlockElement } from "../custom-element";

export type CalloutType = "tip" | "warning" | "info" | "danger" | "note";

export interface CalloutElement {
  type: "callout";
  calloutType: CalloutType;
  title: string;
  children: BlockElement[];
}
