import "./augmentations";
import { defineElement, defineExtension } from "@tau/editor/api";

import type { DetailElement } from "./types";

import Detail from "./components/Detail";
import blockPanelItems from "./block-panel-items";
import { detailBehaviors, detailForParagraph } from "./behaviors";
import { detailCommands, detailMenuItems } from "./utils/menu";
import { conversionCommands, conversionMenuFor } from "./conversion";

const detailExtension = defineExtension({
  id: "tau.detail",
  elements: [
    defineElement<DetailElement>({
      type: "detail",
      kind: "block",
      isEmpty: (element, context) => element.children.every(context.isEmpty),
      render: Detail,
      drag: true,
      behaviors: detailBehaviors,
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
    }),
  ],
  blockPanel: blockPanelItems,
  commands: [...detailCommands, ...conversionCommands],
  menuFor: conversionMenuFor,
  menu: detailMenuItems,
  behaviorsFor: {
    paragraph: detailForParagraph,
  },
});

export default detailExtension;

export type { DetailElement } from "./types";
export { insertDetails } from "./operations";
