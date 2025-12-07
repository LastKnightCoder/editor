import type { GraphvizElement } from "../../types";
import Graphviz from "./components/Graphviz";

import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import Base from "../base";
import IExtension from "../types";

class GraphvizExtension extends Base implements IExtension {
  type = "graphviz";

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
    const { element, attributes, children } = props;
    return (
      <Graphviz element={element as GraphvizElement} attributes={attributes}>
        {children}
      </Graphviz>
    );
  }
}

export default GraphvizExtension;
