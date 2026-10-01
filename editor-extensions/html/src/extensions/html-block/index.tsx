import React, { lazy } from "react";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { HTMLBlockElement } from "../../types";
import blockPanelItems from "./block-panel-items";

const HTMLBlock = lazy(() => import("./components/HTMLBlock"));

const htmlBlockExtension = defineExtension({
  id: "tau.html-block",
  elements: [
    defineElement<HTMLBlockElement>({
      type: "html-block",
      kind: "block",
      isVoid: true,
      isEmpty: element => element.html === "",
      render: ({ attributes, element, children }: ElementRenderProps<HTMLBlockElement>) => (
        <React.Suspense fallback={null}>
          <HTMLBlock element={element} attributes={attributes}>
            {children}
          </HTMLBlock>
        </React.Suspense>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default htmlBlockExtension;
