import { defineElement, defineExtension } from "../../api";

import type { BlockquoteElement } from "../../types";
import Blockquote from "./components/Blockquote";
import blockPanelItems from "./block-panel-items";
import { blockquoteBehaviors, blockquoteForParagraph } from "./behaviors";

const blockquoteExtension = defineExtension({
  id: "tau.blockquote",
  elements: [
    defineElement<BlockquoteElement>({
      type: "blockquote",
      kind: "block",
      render: Blockquote,
      // 手柄与正文左线重叠，压窄让出位置（原组件手柄的位置）
      drag: {
        self: true,
        children: true,
        handleClassName: "top-[0.25em] h-[1.5em] w-[1em] cursor-grab rounded transition-all",
      },
      behaviors: blockquoteBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: blockquoteForParagraph,
  },
});

export default blockquoteExtension;
