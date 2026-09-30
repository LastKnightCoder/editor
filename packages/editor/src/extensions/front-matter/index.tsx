import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import type { FrontMatterElement } from "../../types";
import FrontMatter from "./components/FrontMatter";

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
