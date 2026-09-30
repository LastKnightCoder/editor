import React, { lazy } from "react";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { HTMLInlineElement } from "../../types";
import blockPanelItems from "./block-panel-items";

const InlineHtml = lazy(() => import("./components/InlineHtml"));

const htmlInlineExtension = defineExtension({
  id: "tau.html-inline",
  elements: [
    defineElement<HTMLInlineElement>({
      type: "html-inline",
      kind: "inline",
      isVoid: true,
      isEmpty: element => element.html === "",
      render: ({ attributes, element, children }: ElementRenderProps<HTMLInlineElement>) => (
        <React.Suspense fallback={null}>
          <InlineHtml attributes={attributes} element={element}>
            {children}
          </InlineHtml>
        </React.Suspense>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default htmlInlineExtension;
