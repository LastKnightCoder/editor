import { RenderElementProps } from "slate-react";
import { DivideLineElement } from "@/components/Editor/types";

import DivideLine from "./components/DivideLine";
import { markdownSyntax } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

import Base from "../base.ts";
import IExtension from "../types.ts";

class DivideLineExtension extends Base implements IExtension {
  type = "divide-line";

  override getPlugins() {
    return [
      markdownSyntax,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <DivideLine
        attributes={attributes}
        element={element as DivideLineElement}
      >
        {children}
      </DivideLine>
    );
  }
}

export default DivideLineExtension;
