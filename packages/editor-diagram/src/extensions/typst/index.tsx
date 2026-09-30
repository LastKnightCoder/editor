import loadable from "@loadable/component";

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";

import type { TypstElement } from "../../types/typst";
import blockPanelItems from "./block-panel-items";

const Typst = loadable(() => import("./components/Typst"));

const typstExtension = defineExtension({
  id: "tau.typst",
  elements: [
    defineElement<TypstElement>({
      type: "typst",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<TypstElement>) => (
        <Typst element={element} attributes={attributes}>
          {children}
        </Typst>
      ),
    }),
  ],
  blockPanel: blockPanelItems,
});

export default typstExtension;
