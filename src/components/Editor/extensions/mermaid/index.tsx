import loadable from "@loadable/component";
import { MermaidElement } from "@/components/Editor/types";

import Base from "../base";
import IExtension from "../types.ts";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
const MermaidChart = loadable(() => import("./components/MermaidChart.tsx"));

class MermaidExtension extends Base implements IExtension {
  type = "mermaid";

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
      <MermaidChart element={element as MermaidElement} attributes={attributes}>
        {children}
      </MermaidChart>
    );
  }
}

export default MermaidExtension;
