import { defineElement, defineExtension } from "@tau/editor/api";

import type { NumberedListElement } from "../../types";
import NumberedList from "./components/NumberedList";
import blockPanelItems from "./block-panel-items";
import { numberedListBehaviors, numberedListForParagraph } from "./behaviors";
import { createListConversion } from "../list-item/conversion";

const numberedListExtension = defineExtension({
  ...createListConversion("numbered-list"),
  id: "tau.numbered-list",
  elements: [
    defineElement<NumberedListElement>({
      type: "numbered-list",
      dataVersion: 1,
      kind: "block",
      isEmpty: (element, context) => element.children.every(context.isEmpty),
      render: NumberedList,
      behaviors: numberedListBehaviors,
      copy: ({ element, fullySelected }) =>
        fullySelected ||
        (element.children.length > 0 && element.children.every(child => child.type === "list-item"))
          ? "keep"
          : "unwrap",
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: numberedListForParagraph,
  },
});

export default numberedListExtension;
