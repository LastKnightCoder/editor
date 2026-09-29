import { RenderElementProps } from "slate-react";
import type { DetailElement } from "../../types";

import Detail from "./components/Detail";
import { deleteBackward, quit, withNormalize } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin } from "../../utils";
import { detailCommands, detailMenuItems } from "./utils/menu";

import Base from "../base";
import IExtension from "../types";

class DetailExtension extends Base implements IExtension {
  type = "detail";
  override commands = detailCommands;
  override menuItems = detailMenuItems;
  override dragSpec = true;
  override getPlugins() {
    return [deleteBackward, quit, withNormalize, createBlockElementPlugin(this.type)];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Detail element={element as DetailElement} attributes={attributes}>
        {children}
      </Detail>
    );
  }
}

export default DetailExtension;
