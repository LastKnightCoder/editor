import loadable from "@loadable/component";
import type {} from "./augmentations";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { CustomBlockElement } from "./types";

import blockPanelItems from "./block-panel-items";
import { customBlockForParagraph } from "./behaviors";

// loadable 组件走 Suspense，加载期间内核渲染保留结构的空壳
const CustomBlock = loadable(() => import("./components/CustomBlock"));

const customBlockExtension = defineExtension({
  id: "tau.custom-block",
  elements: [
    defineElement<CustomBlockElement>({
      type: "custom-block",
      kind: "block",
      isVoid: true,
      isEmpty: element => element.content === "",
      render: ({ attributes, element, children }: ElementRenderProps<CustomBlockElement>) => (
        <CustomBlock element={element} attributes={attributes}>
          {children}
        </CustomBlock>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: customBlockForParagraph,
  },
});

export default customBlockExtension;
export { customBlockExtension };
export type { CustomBlockElement } from "./types";
export { insertCustomBlock } from "./insert";
