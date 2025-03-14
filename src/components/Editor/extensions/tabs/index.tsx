import { RenderElementProps } from "slate-react";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { TabsElement } from "@/components/Editor/types";

import Tabs from "./components/Tabs";
import blockPanelItems from "./block-panel-items";
import { deleteEmptyTab, quit, withNormalize } from "./plugins";

class TabsExtension extends Base implements IExtension {
  type = "tabs";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [deleteEmptyTab, quit, withNormalize];
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
