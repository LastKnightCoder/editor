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
      // 大引号与竖线都在块内左栏，手柄留在默认槽位不会重叠
      drag: { self: true, children: true },
      behaviors: blockquoteBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: blockquoteForParagraph,
  },
});

export default blockquoteExtension;
