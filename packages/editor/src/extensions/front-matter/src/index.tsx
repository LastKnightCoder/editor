import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import "./augmentations";

import { type FrontMatterElement } from "./types.ts";
import FrontMatter from "./components/FrontMatter/index.tsx";

const frontMatterExtension = defineExtension({
  id: "tau.front-matter",
  elements: [
    defineElement<FrontMatterElement>({
      type: "front-matter",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<FrontMatterElement>) => (
        <FrontMatter element={element} attributes={attributes}>
          {children}
        </FrontMatter>
      ),
    }),
  ],
});

export default frontMatterExtension;
export type { FrontMatterElement } from "./types";
