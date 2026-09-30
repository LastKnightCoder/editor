import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { KbdElement } from "../../types";
import Kbd from "./components/Kbd";
import hoveringBarConfigs from "./hovering-bar-configs";

const kbdExtension = defineExtension({
  id: "tau.kbd",
  elements: [
    defineElement<KbdElement>({
      type: "kbd",
      kind: "inline",
      render: ({ attributes, element, children }: ElementRenderProps<KbdElement>) => (
        <Kbd attributes={attributes} element={element}>
          {children}
        </Kbd>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
});

export default kbdExtension;
