import loadable from "@loadable/component";
import type { PlantUMLElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
const PlantUMLBlock = loadable(() => import("./components/PlantUMLBlock.tsx"));

export interface PlantUMLExtensionOptions {
  /** PlantUML 渲染服务器地址，默认 https://www.plantuml.com/plantuml */
  server?: string;
  /** 暗色时注入的 !theme（置空串禁用），默认 cyborg-outline */
  darkTheme?: string;
}

class PlantUMLExtension extends Base implements IExtension {
  type = "plantuml";

  private readonly options: PlantUMLExtensionOptions;

  constructor(options: PlantUMLExtensionOptions = {}) {
    super();
    this.options = options;
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <PlantUMLBlock
        element={element as PlantUMLElement}
        attributes={attributes}
        server={this.options.server}
        darkTheme={this.options.darkTheme}
      >
        {children}
      </PlantUMLBlock>
    );
  }
}

export default PlantUMLExtension;
