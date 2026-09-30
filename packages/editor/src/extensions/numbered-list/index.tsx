import { defineElement, defineExtension } from "../../api";

import type { NumberedListElement } from "../../types";
import NumberedList from "./components/NumberedList";
import blockPanelItems from "./block-panel-items";
import { numberedListBehaviors, numberedListForParagraph } from "./behaviors";

const numberedListExtension = defineExtension({
  id: "tau.numbered-list",
  elements: [
    defineElement<NumberedListElement>({
      type: "numbered-list",
      kind: "block",
      render: NumberedList,
      behaviors: numberedListBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: numberedListForParagraph,
  },
});

export default numberedListExtension;
