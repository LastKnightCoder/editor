import { RenderElementProps } from "slate-react";

import Base from "../base";
import IExtension from "../types";
import Whiteboard from "./components/Whiteboard";
import { WhiteboardElement } from "../../types/element/whiteboard";
import { withSetting } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
class WhiteboardExtension extends Base implements IExtension {
  type = "whiteboard";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      withSetting,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Whiteboard
        attributes={attributes}
        element={element as unknown as WhiteboardElement}
      >
        {children}
      </Whiteboard>
    );
  }
}

export default WhiteboardExtension;
