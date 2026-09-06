import { RenderElementProps } from "slate-react";
import Base from "../base";
import IExtension from "../types";
import type { TabsElement, TabPaneElement } from "../../types";

import Tabs from "./components/Tabs";
import TabPane from "./components/TabPane";
import EnsureDndProvider from "./components/EnsureDndProvider";
import blockPanelItems from "./block-panel-items";
import { deleteEmptyTab, quit, withNormalize } from "./plugins";
import { createBlockElementPlugin } from "../../utils";

class TabsExtension extends Base implements IExtension {
  type = "tabs";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [deleteEmptyTab, quit, withNormalize, createBlockElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <EnsureDndProvider>
        <Tabs element={element as TabsElement} attributes={attributes}>
          {children}
        </Tabs>
      </EnsureDndProvider>
    );
  }
}

class TabPaneExtension extends Base implements IExtension {
  type = "tab-pane";

  render(props: RenderElementProps) {
    return <TabPane {...props} element={props.element as TabPaneElement} />;
  }
}

export { TabPaneExtension };

export default TabsExtension;
