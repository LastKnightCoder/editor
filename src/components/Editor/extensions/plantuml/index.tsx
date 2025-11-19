import loadable from "@loadable/component";
import { PlantUMLElement } from "@/components/Editor/types";

import Base from "../base";
import IExtension from "../types.ts";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
const PlantUMLBlock = loadable(() => import("./components/PlantUMLBlock.tsx"));

class PlantUMLExtension extends Base implements IExtension {
  type = "plantuml";

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
      <PlantUMLBlock
        element={element as PlantUMLElement}
        attributes={attributes}
      >
        {children}
      </PlantUMLBlock>
    );
  }
}

export default PlantUMLExtension;
