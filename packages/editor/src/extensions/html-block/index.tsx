import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { HTMLBlockElement } from "../../types";
import HTMLBlock from "./components/HTMLBlock";
import blockPanelItems from "./block-panel-items";

const htmlBlockExtension = defineExtension({
  id: "tau.html-block",
  elements: [
    defineElement<HTMLBlockElement>({
      type: "html-block",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<HTMLBlockElement>) => (
        <HTMLBlock element={element} attributes={attributes}>
          {children}
        </HTMLBlock>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default htmlBlockExtension;
