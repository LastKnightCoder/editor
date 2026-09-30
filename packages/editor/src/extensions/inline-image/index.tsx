import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { InlineImageElement } from "../../types";
import InlineImage from "./components/InlineImage";
import blockPanelItems from "./block-panel-items";

// 粘贴认领（非空段落插行内图）由 image 扩展的 ingest 统一承担（01 §5.4）

const inlineImageExtension = defineExtension({
  id: "tau.inline-image",
  elements: [
    defineElement<InlineImageElement>({
      type: "inline-image",
      kind: "inline",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<InlineImageElement>) => (
        <InlineImage element={element} attributes={attributes}>
          {children}
        </InlineImage>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default inlineImageExtension;
