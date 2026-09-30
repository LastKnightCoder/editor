import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { TikzElement } from "../../types";
import blockPanelItems from "./block-panel-items";

const Tikz = loadable(() => import("./components/Tikz"));

const tikzExtension = defineExtension({
  id: "tau.tikz",
  elements: [
    defineElement<TikzElement>({
      type: "tikz",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<TikzElement>) => (
        <Tikz element={element} attributes={attributes}>
          {children}
        </Tikz>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default tikzExtension;
