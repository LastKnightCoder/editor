import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import type {} from "./augmentations";

import { type KbdElement } from "./types.ts";
import Kbd from "./components/Kbd/index.tsx";
import hoveringBarConfigs from "./hovering-bar-configs/index.ts";

const kbdExtension = defineExtension({
  id: "tau.kbd",
  elements: [
    defineElement<KbdElement>({
      type: "kbd",
      kind: "inline",
      isEmpty: element => element.children.length === 1 && element.children[0].text === "",
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
export type { KbdElement } from "./types";
export { wrapKbd, unwrapKbd } from "./operations";
