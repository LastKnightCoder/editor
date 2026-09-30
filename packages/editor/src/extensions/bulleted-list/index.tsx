import { defineElement, defineExtension } from "../../api";

import type { BulletedListElement } from "../../types";
import BulletedList from "./components/BulletedList";
import blockPanelItems from "./block-panle-items";
import { bulletedListBehaviors, bulletedListForParagraph } from "./behaviors";

const bulletedListExtension = defineExtension({
  id: "tau.bulleted-list",
  elements: [
    defineElement<BulletedListElement>({
      type: "bulleted-list",
      kind: "block",
      render: BulletedList,
      behaviors: bulletedListBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: bulletedListForParagraph,
  },
});

export default bulletedListExtension;
