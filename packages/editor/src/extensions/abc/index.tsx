import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { AbcElement } from "../../types";
import blockPanelItems from "./block-panel-items";

const AbcBlock = loadable(() => import("./components/AbcBlock.tsx"));

const abcExtension = defineExtension({
  id: "tau.abc",
  elements: [
    defineElement<AbcElement>({
      type: "abc",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<AbcElement>) => (
        <AbcBlock element={element} attributes={attributes}>
          {children}
        </AbcBlock>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default abcExtension;
