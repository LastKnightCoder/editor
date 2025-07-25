import loadable from "@loadable/component";
import { CustomBlockElement } from "@/components/Editor/types";

import { RenderElementProps } from "slate-react";

import Base from "../base.ts";
import IExtension from "../types.ts";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

import blockPanelItems from "./block-panel-items";
import { deleteBackward } from "./plugins";

const CustomBlock = loadable(() => import("./components/CustomBlock"));

class CustomBlockExtension extends Base implements IExtension {
  type = "custom-block";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      deleteBackward,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <CustomBlock
        element={element as CustomBlockElement}
        attributes={attributes}
      >
        {children}
      </CustomBlock>
    );
  }
}

export default CustomBlockExtension;
