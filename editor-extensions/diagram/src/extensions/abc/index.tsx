import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { AbcElement } from "../../types/abc";
import blockPanelItems from "./block-panel-items";

const AbcBlock = loadable(() => import("./components/AbcBlock.tsx"));

const abcExtension = defineExtension({
  id: "tau.abc",
  elements: [
    defineElement<AbcElement>({
      type: "abc",
      kind: "block",
      drag: true,
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
