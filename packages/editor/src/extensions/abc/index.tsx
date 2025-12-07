import loadable from "@loadable/component";
import type { AbcElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
const AbcBlock = loadable(() => import("./components/AbcBlock.tsx"));

class AbcExtension extends Base implements IExtension {
  type = "abc";

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
      <AbcBlock element={element as AbcElement} attributes={attributes}>
        {children}
      </AbcBlock>
    );
  }
}

export default AbcExtension;
