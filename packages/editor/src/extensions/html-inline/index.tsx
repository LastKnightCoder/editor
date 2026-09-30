import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { HTMLInlineElement } from "../../types";
import InlineHtml from "./components/InlineHtml";
import blockPanelItems from "./block-panel-items";

const htmlInlineExtension = defineExtension({
  id: "tau.html-inline",
  elements: [
    defineElement<HTMLInlineElement>({
      type: "html-inline",
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<HTMLInlineElement>) => (
        <InlineHtml attributes={attributes} element={element}>
          {children}
        </InlineHtml>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default htmlInlineExtension;
