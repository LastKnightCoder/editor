import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { BlockMathElement, InlineMathElement } from "../../types";
import InlineMath from "./components/InlineMath";
import BlockMath from "./components/BlockMath";

import {
  inlineMathCommands,
  inlineMathHotkeys,
  blockMathCommands,
  blockMathHotkeys,
} from "./commands";
import blockPanelItems from "./block-panel-items";
import hoveringBarConfigs from "./hovering-bar-configs";

export const inlineMathExtension = defineExtension({
  id: "tau.inline-math",
  elements: [
    defineElement<InlineMathElement>({
      type: "inline-math",
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<InlineMathElement>) => (
        <InlineMath attributes={attributes} element={element}>
          {children}
        </InlineMath>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
  blockPanel: blockPanelItems,
  commands: inlineMathCommands,
  hotkeys: inlineMathHotkeys,
});

export const blockMathExtension = defineExtension({
  id: "tau.block-math",
  elements: [
    defineElement<BlockMathElement>({
      type: "block-math",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<BlockMathElement>) => (
        <BlockMath attributes={attributes} element={element}>
          {children}
        </BlockMath>
      ),
    }),
  ],
  commands: blockMathCommands,
  hotkeys: blockMathHotkeys,
});
