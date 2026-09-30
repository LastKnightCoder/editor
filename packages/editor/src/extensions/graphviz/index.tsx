import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { GraphvizElement } from "../../types";
import Graphviz from "./components/Graphviz";
import blockPanelItems from "./block-panel-items";

const graphvizExtension = defineExtension({
  id: "tau.graphviz",
  elements: [
    defineElement<GraphvizElement>({
      type: "graphviz",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<GraphvizElement>) => (
        <Graphviz element={element} attributes={attributes}>
          {children}
        </Graphviz>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default graphvizExtension;
