import { defineElement, defineExtension } from "../../api";

import HighlightBlock from "./components/HighlightBlock";
import type { HighlightBlockElement } from "../../types";

import blockPanelItems from "./block-panel-items";
import { highlightBlockBehaviors } from "./behaviors";
import { highlightBlockCommands, highlightBlockMenuItems } from "./utils/menu";

const highlightBlockExtension = defineExtension({
  id: "tau.highlight-block",
  elements: [
    defineElement<HighlightBlockElement>({
      type: "highlight-block",
      kind: "block",
      render: HighlightBlock,
      drag: true,
      behaviors: highlightBlockBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: highlightBlockCommands,
  menu: highlightBlockMenuItems,
});

export default highlightBlockExtension;
