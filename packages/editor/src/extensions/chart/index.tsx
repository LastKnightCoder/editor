import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { ChartElement } from "../../types";
import blockPanelItems from "./block-panel-items";
import { chartCommands, chartMenuItems } from "./utils/menu";

const ChartBlock = loadable(() => import("./components/ChartBlock"));

const chartExtension = defineExtension({
  id: "tau.chart",
  elements: [
    defineElement<ChartElement>({
      type: "chart",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<ChartElement>) => (
        <ChartBlock element={element} attributes={attributes}>
          {children}
        </ChartBlock>
      ),
      drag: true,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: chartCommands,
  menu: chartMenuItems,
});

export default chartExtension;
