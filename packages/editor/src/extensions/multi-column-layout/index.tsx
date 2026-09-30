import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { MultiColumnContainerElement, MultiColumnItemElement } from "../../types";

import MultiColumnsContainer from "./components/MultiColumnsContainer";
import MultiColumnItem from "./components/MultiColumnItem";

import { multiColumnContainerBehaviors, multiColumnItemBehaviors } from "./behaviors";
import { multiColumnCommands, multiColumnHotkeys } from "./commands";
import blockPanelItems from "./block-panel-items";

export const multiColumnContainerExtension = defineExtension({
  id: "tau.multi-column-container",
  elements: [
    defineElement<MultiColumnContainerElement>({
      type: "multi-column-container",
      kind: "block",
      render: ({
        attributes,
        element,
        children,
      }: ElementRenderProps<MultiColumnContainerElement>) => (
        <MultiColumnsContainer attributes={attributes} element={element}>
          {children}
        </MultiColumnsContainer>
      ),
      drag: true,
      behaviors: multiColumnContainerBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
});

export const multiColumnItemExtension = defineExtension({
  id: "tau.multi-column-item",
  elements: [
    defineElement<MultiColumnItemElement>({
      type: "multi-column-item",
      kind: "block",
      render: ({ attributes, element, children }: ElementRenderProps<MultiColumnItemElement>) => (
        <MultiColumnItem attributes={attributes} element={element}>
          {children}
        </MultiColumnItem>
      ),
      behaviors: multiColumnItemBehaviors,
    }),
  ],
  commands: multiColumnCommands,
  hotkeys: multiColumnHotkeys,
});
