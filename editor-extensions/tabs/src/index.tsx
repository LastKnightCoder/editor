import type {} from "./augmentations";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { TabPaneElement, TabsElement } from "./types";

import Tabs from "./components/Tabs";
import TabPane from "./components/TabPane";
import EnsureDndProvider from "./components/EnsureDndProvider";
import blockPanelItems from "./block-panel-items";
import { tabsBehaviors, tabPaneBehaviors } from "./behaviors";

const tabsExtension = defineExtension({
  id: "tau.tabs",
  elements: [
    defineElement<TabsElement>({
      type: "tabs",
      kind: "block",
      isolateBlockNavigation: true,
      render: ({ attributes, element, children }: ElementRenderProps<TabsElement>) => (
        <EnsureDndProvider>
          <Tabs element={element} attributes={attributes}>
            {children}
          </Tabs>
        </EnsureDndProvider>
      ),
      drag: true,
      behaviors: tabsBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
});

const tabPaneExtension = defineExtension({
  id: "tau.tab-pane",
  elements: [
    defineElement<TabPaneElement>({
      type: "tab-pane",
      kind: "block",
      render: ({ attributes, element, children }: ElementRenderProps<TabPaneElement>) => (
        <TabPane attributes={attributes} element={element}>
          {children}
        </TabPane>
      ),
      behaviors: tabPaneBehaviors,
    }),
  ],
});

export { tabPaneExtension };

export default tabsExtension;

export const tabsExtensions = [tabsExtension, tabPaneExtension] as const;
export type { TabsElement, TabPaneElement, ITabItem, ITabsContent } from "./types";
export { insertTabs } from "./operations";
