import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import { type InlineImageElement } from "../../types/index";
import InlineImage from "./components/InlineImage/index";
import blockPanelItems from "./block-panel-items/index";

// 粘贴认领（非空段落插行内图）由 image 扩展的 ingest 统一承担（01 §5.4）

const inlineImageExtension = defineExtension({
  id: "tau.inline-image",
  elements: [
    defineElement<InlineImageElement>({
      type: "inline-image",
      resources: BUILTIN_CONTENT_RESOURCES["inline-image"],
      kind: "inline",
      isEmpty: element => !element.url,
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
