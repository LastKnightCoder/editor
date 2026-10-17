import loadable from "@loadable/component";
import type {} from "./augmentations";

import {
  defineEditorElement as defineElement,
  defineEditorExtension as defineExtension,
  type EditorElementRenderProps as ElementRenderProps,
} from "@tau/plugins";

import type { CustomBlockElement } from "./types";

import blockPanelItems from "./block-panel-items";
import { customBlockForParagraph } from "./behaviors";

// loadable 组件走 Suspense，加载期间内核渲染保留结构的空壳
const CustomBlock = loadable(() => import("./components/CustomBlock"));

const customBlockExtension = defineExtension({
  id: "tau.custom-block",
  styleSources: [{ type: "custom-block", field: "content", language: "tsx" }],
  htmlSerializers: [
    {
      type: "custom-block",
      toHtml: element =>
        `<div class="plugin-source-block"><pre><code>${String(element.content ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!)}</code></pre></div>`,
    },
  ],
  elements: [
    defineElement<CustomBlockElement>({
      type: "custom-block",
      kind: "block",
      drag: true,
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
