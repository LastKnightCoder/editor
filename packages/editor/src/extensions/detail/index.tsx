import { defineElement, defineExtension } from "../../api";

import type { DetailElement } from "../../types";

import Detail from "./components/Detail";
import blockPanelItems from "./block-panel-items";
import { detailBehaviors, detailForParagraph } from "./behaviors";
import { detailCommands, detailMenuItems } from "./utils/menu";

const detailExtension = defineExtension({
  id: "tau.detail",
  elements: [
    defineElement<DetailElement>({
      type: "detail",
      kind: "block",
      render: Detail,
      drag: true,
      behaviors: detailBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: detailCommands,
  menu: detailMenuItems,
  behaviorsFor: {
    paragraph: detailForParagraph,
  },
});

export default detailExtension;
