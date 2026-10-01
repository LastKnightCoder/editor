import type {} from "./augmentations";
import { defineElement, defineExtension } from "@tau/editor/api";

import type { BlockquoteElement } from "./types";
import Blockquote from "./components/Blockquote";
import blockPanelItems from "./block-panel-items";
import { blockquoteBehaviors, blockquoteForParagraph } from "./behaviors";
import { conversionCommands, conversionMenuFor } from "./conversion";

const blockquoteExtension = defineExtension({
  id: "tau.blockquote",
  elements: [
    defineElement<BlockquoteElement>({
      type: "blockquote",
      kind: "block",
      isEmpty: (element, context) => element.children.every(context.isEmpty),
      render: Blockquote,
      // 大引号与竖线都在块内左栏，手柄留在默认槽位不会重叠
      drag: { self: true, children: true },
      behaviors: blockquoteBehaviors,
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
    }),
  ],
  blockPanel: blockPanelItems,
  commands: conversionCommands,
  menuFor: conversionMenuFor,
  behaviorsFor: {
    paragraph: blockquoteForParagraph,
  },
});

export default blockquoteExtension;

export type { BlockquoteElement } from "./types";
export { insertBlockquote } from "./operations";
