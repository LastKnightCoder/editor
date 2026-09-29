import { RenderElementProps } from "slate-react";
import type { CalloutElement } from "../../types";

import blockPanelItems from "./blockPanelItems";
import Callout from "./components/Callout.tsx";
import { deleteFirstLineCallout, quit, withNormalize } from "./plugins";
import { createBlockElementPlugin } from "../../utils";
import { calloutCommands, calloutMenuItems } from "./utils/menu";

import Base from "../base";
import IExtension from "../types";

class CalloutExtension extends Base implements IExtension {
  type = "callout";

  override commands = calloutCommands;
  override menuItems = calloutMenuItems;

  override getPlugins() {
    return [deleteFirstLineCallout, quit, withNormalize, createBlockElementPlugin(this.type)];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Callout element={element as CalloutElement} attributes={attributes}>
        {children}
      </Callout>
    );
  }
}

export default CalloutExtension;
