import { defineElement, defineExtension } from "@tau/editor/api";

import type { BulletedListElement } from "../../types";
import BulletedList from "./components/BulletedList";
import blockPanelItems from "./block-panle-items";
import { bulletedListBehaviors, bulletedListForParagraph } from "./behaviors";
import { createListConversion } from "../list-item/conversion";

const bulletedListExtension = defineExtension({
  ...createListConversion("bulleted-list"),
  id: "tau.bulleted-list",
  elements: [
    defineElement<BulletedListElement>({
      type: "bulleted-list",
      kind: "block",
      isEmpty: (element, context) => element.children.every(context.isEmpty),
      render: BulletedList,
      behaviors: bulletedListBehaviors,
      copy: ({ element, fullySelected }) =>
        fullySelected ||
        (element.children.length > 0 && element.children.every(child => child.type === "list-item"))
          ? "keep"
          : "unwrap",
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: bulletedListForParagraph,
  },
});

export default bulletedListExtension;
