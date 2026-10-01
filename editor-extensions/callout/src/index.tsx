import type {} from "./augmentations";
import { defineElement, defineExtension } from "@tau/editor/api";

import type { CalloutElement } from "./types";
import blockPanelItems from "./blockPanelItems";
import Callout from "./components/Callout.tsx";
import { calloutBehaviors } from "./behaviors";
import { calloutCommands, calloutMenuItems } from "./utils/menu";
import { conversionCommands, conversionMenuFor } from "./conversion";

const calloutExtension = defineExtension({
  id: "tau.callout",
  elements: [
    defineElement<CalloutElement>({
      type: "callout",
      kind: "block",
      isEmpty: (element, context) => element.children.every(context.isEmpty),
      render: Callout,
      drag: true,
      behaviors: calloutBehaviors,
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
    }),
  ],
  blockPanel: blockPanelItems,
  commands: [...calloutCommands, ...conversionCommands],
  menuFor: conversionMenuFor,
  menu: calloutMenuItems,
});

export default calloutExtension;

export type { CalloutElement, CalloutType } from "./types";
export { insertCallout } from "./operations";
