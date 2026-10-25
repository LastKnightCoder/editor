import React from "react";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import "./augmentations";

import type { EmojiElement } from "./types";
const Emoji = React.lazy(() => import("./components/Emoji"));
import blockPanelItems from "./block-panel-items";

const emojiExtension = defineExtension({
  id: "tau.emoji",
  elements: [
    defineElement<EmojiElement>({
      type: "emoji",
      dataVersion: 1,
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<EmojiElement>) => (
        <React.Suspense fallback={null}>
          <Emoji element={element} attributes={attributes}>
            {children}
          </Emoji>
        </React.Suspense>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default emojiExtension;
export { emojiExtension };
export type { EmojiElement } from "./types";
