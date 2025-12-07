import { RenderElementProps } from "slate-react";

import loadable from "@loadable/component";
import type { TikzElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import blockPanelItems from "./block-panel-items";

const Tikz = loadable(() => import("./components/Tikz"));

class TikzExtension extends Base implements IExtension {
  type = "tikz";

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
      <Tikz element={element as TikzElement} attributes={attributes}>
        {children}
      </Tikz>
    );
  }
}

export default TikzExtension;
