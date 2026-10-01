import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import React from "react";
import type {} from "./augmentations";

import type { BlockMathElement, InlineMathElement } from "./types";
const InlineMath = React.lazy(() => import("./components/InlineMath"));
const BlockMath = React.lazy(() => import("./components/BlockMath"));

import {
  inlineMathCommands,
  inlineMathHotkeys,
  blockMathCommands,
  blockMathHotkeys,
} from "./commands";
import blockPanelItems from "./block-panel-items";
import hoveringBarConfigs from "./hovering-bar-configs";
import { normalizeInlineMath } from "./behaviors";
export type { InlineMathElement, BlockMathElement } from "./types";
export { insertBlockMath, wrapInlineMath, unWrapInlineMath } from "./insert";

export const inlineMathExtension = defineExtension({
  id: "tau.inline-math",
  elements: [
    defineElement<InlineMathElement>({
      type: "inline-math",
      kind: "inline",
      isVoid: true,
      isEmpty: element => element.tex === "",
      behaviors: { normalize: normalizeInlineMath },
      render: ({ attributes, element, children }: ElementRenderProps<InlineMathElement>) => (
        <React.Suspense fallback={null}>
          <InlineMath attributes={attributes} element={element}>
            {children}
          </InlineMath>
        </React.Suspense>
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
      isEmpty: element => element.tex === "",
      render: ({ attributes, element, children }: ElementRenderProps<BlockMathElement>) => (
        <React.Suspense fallback={null}>
          <BlockMath attributes={attributes} element={element}>
            {children}
          </BlockMath>
        </React.Suspense>
      ),
    }),
  ],
  commands: blockMathCommands,
  hotkeys: blockMathHotkeys,
});

export const mathExtensions = [inlineMathExtension, blockMathExtension] as const;
