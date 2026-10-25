import "./augmentations";
import { defineElement, defineExtension } from "@tau/editor/api";

import HighlightBlock from "./components/HighlightBlock";
import type { HighlightBlockElement } from "./types";

import blockPanelItems from "./block-panel-items";
import { highlightBlockBehaviors } from "./behaviors";
import { highlightBlockCommands, highlightBlockMenuItems } from "./utils/menu";
import { conversionCommands, conversionMenuFor } from "./conversion";

const highlightBlockExtension = defineExtension({
  id: "tau.highlight-block",
  elements: [
    defineElement<HighlightBlockElement>({
      type: "highlight-block",
      dataVersion: 1,
      kind: "block",
      render: HighlightBlock,
      drag: true,
      behaviors: highlightBlockBehaviors,
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
    }),
  ],
  blockPanel: blockPanelItems,
  commands: [...highlightBlockCommands, ...conversionCommands],
  menuFor: conversionMenuFor,
  menu: highlightBlockMenuItems,
});

export default highlightBlockExtension;

export type { HighlightBlockElement, Color } from "./types";
export { insertHighlightBlock } from "./operations";
