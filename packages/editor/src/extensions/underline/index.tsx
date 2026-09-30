import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import Underline from "./components/Underline";
import type { UnderlineElement } from "../../types";
import hoveringBarConfigs from "./hovering-bar-configs";

const underlineExtension = defineExtension({
  id: "tau.underline",
  elements: [
    defineElement<UnderlineElement>({
      type: "underline",
      kind: "inline",
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
