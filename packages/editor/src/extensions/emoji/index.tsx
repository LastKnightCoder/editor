import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { EmojiElement } from "../../types";
import Emoji from "./components/Emoji";
import blockPanelItems from "./block-panel-items";

const emojiExtension = defineExtension({
  id: "tau.emoji",
  elements: [
    defineElement<EmojiElement>({
      type: "emoji",
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<EmojiElement>) => (
        <Emoji element={element} attributes={attributes}>
          {children}
        </Emoji>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default emojiExtension;
