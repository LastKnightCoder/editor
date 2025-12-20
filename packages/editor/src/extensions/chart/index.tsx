import loadable from "@loadable/component";
import type { ChartElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
const ChartBlock = loadable(() => import("./components/ChartBlock"));

class ChartExtension extends Base implements IExtension {
  type = "chart";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <ChartBlock element={element as ChartElement} attributes={attributes}>
        {children}
      </ChartBlock>
    );
  }
}

export default ChartExtension;
