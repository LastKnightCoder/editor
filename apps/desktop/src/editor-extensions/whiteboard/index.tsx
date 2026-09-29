import { RenderElementProps } from "slate-react";
import { Base, IExtension } from "@tau/editor/src";
import Whiteboard from "./components/Whiteboard";
import { withSetting } from "./plugins";
import blockPanelItems from "./block-panel-items";
import type { WhiteboardElement } from "./types";
export type { WhiteboardElement } from "./types";
import { createBlockElementPlugin, createVoidElementPlugin } from "@tau/editor/src";

class WhiteboardExtension extends Base implements IExtension {
  type = "whiteboard";

  override dragSpec = true;

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [withSetting, createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Whiteboard attributes={attributes} element={element as unknown as WhiteboardElement}>
        {children}
      </Whiteboard>
    );
  }
}

export default WhiteboardExtension;
