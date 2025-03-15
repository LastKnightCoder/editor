import { RenderElementProps } from "slate-react";

import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import Whiteboard from "./components/Whiteboard";
import { WhiteboardElement } from "@/components/Editor/types/element/whiteboard.ts";
import { withSetting } from "./plugins";
import blockPanelItems from "./block-panel-items";

class WhiteboardExtension extends Base implements IExtension {
  type = "whiteboard";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [withSetting];
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
