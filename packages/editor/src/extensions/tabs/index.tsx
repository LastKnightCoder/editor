import { RenderElementProps } from "slate-react";
import Base from "../base";
import IExtension from "../types";
import type { TabsElement } from "../../types";

import Tabs from "./components/Tabs";
import blockPanelItems from "./block-panel-items";
import { deleteEmptyTab, quit, withNormalize } from "./plugins";
import { createBlockElementPlugin } from "../../utils";

class TabsExtension extends Base implements IExtension {
  type = "tabs";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      deleteEmptyTab,
      quit,
      withNormalize,
      createBlockElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <Tabs element={element as TabsElement} attributes={attributes}>
        {children}
      </Tabs>
    );
  }
}

export default TabsExtension;
