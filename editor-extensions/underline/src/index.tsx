import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import Underline from "./components/Underline/index.tsx";
import { type UnderlineElement } from "./types.ts";
import hoveringBarConfigs from "./hovering-bar-configs/index.ts";

const underlineExtension = defineExtension({
  id: "tau.underline",
  elements: [
    defineElement<UnderlineElement>({
      type: "underline",
      kind: "inline",
      isEmpty: element => element.children.length === 1 && element.children[0].text === "",
      render: ({ attributes, element, children }: ElementRenderProps<UnderlineElement>) => (
        <Underline element={element} attributes={attributes}>
          {children}
        </Underline>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
});

export default underlineExtension;
export type { UnderlineElement } from "./types";
export { wrapUnderline, unwrapUnderline } from "./selection";
import type {} from "./augmentations";
