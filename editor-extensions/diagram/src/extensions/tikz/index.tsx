import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { TikzElement } from "../../types/tikz";
import blockPanelItems from "./block-panel-items";

const Tikz = loadable(() => import("./components/Tikz"));

const tikzExtension = defineExtension({
  id: "tau.tikz",
  elements: [
    defineElement<TikzElement>({
      type: "tikz",
      kind: "block",
      drag: true,
      isVoid: true,
      isEmpty: element => element.content === "",
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
