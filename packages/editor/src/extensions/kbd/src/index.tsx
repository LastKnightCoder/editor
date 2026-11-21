import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import "./augmentations";

import { type KbdElement } from "./types.ts";
import Kbd from "./components/Kbd/index.tsx";
import hoveringBarConfigs from "./hovering-bar-configs/index.ts";

const kbdExtension = defineExtension({
  id: "tau.kbd",
  elements: [
    defineElement<KbdElement>({
      type: "kbd",
      dataVersion: 1,
      kind: "inline",
      isEmpty: ({ children }, { isEmpty }) => children.length === 1 && isEmpty(children[0]),
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
