import { defineElement, defineExtension } from "../../api";

import type { CalloutElement } from "../../types";
import blockPanelItems from "./blockPanelItems";
import Callout from "./components/Callout.tsx";
import { calloutBehaviors } from "./behaviors";
import { calloutCommands, calloutMenuItems } from "./utils/menu";

const calloutExtension = defineExtension({
  id: "tau.callout",
  elements: [
    defineElement<CalloutElement>({
      type: "callout",
      kind: "block",
      render: Callout,
      drag: true,
      behaviors: calloutBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: calloutCommands,
  menu: calloutMenuItems,
});

export default calloutExtension;
