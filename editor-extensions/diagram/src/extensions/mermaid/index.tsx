import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { MermaidElement } from "../../types/mermaid";
import blockPanelItems from "./block-panel-items";

const MermaidChart = loadable(() => import("./components/MermaidChart.tsx"));

const mermaidExtension = defineExtension({
  id: "tau.mermaid",
  elements: [
    defineElement<MermaidElement>({
      type: "mermaid",
      kind: "block",
      drag: true,
      isVoid: true,
      isEmpty: element => element.chart === "",
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
