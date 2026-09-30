import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { MermaidElement } from "../../types";
import blockPanelItems from "./block-panel-items";

const MermaidChart = loadable(() => import("./components/MermaidChart.tsx"));

const mermaidExtension = defineExtension({
  id: "tau.mermaid",
  elements: [
    defineElement<MermaidElement>({
      type: "mermaid",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<MermaidElement>) => (
        <MermaidChart element={element} attributes={attributes}>
          {children}
        </MermaidChart>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default mermaidExtension;
