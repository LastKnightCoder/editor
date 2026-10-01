import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import type {} from "./augmentations";

import Link from "./components/Link.tsx";
import { type LinkElement } from "./types.ts";

import hoveringBarConfigs from "./hovering-bar-configs/index.ts";
import { linkCommands, linkHotkeys } from "./commands.ts";

const linkExtension = defineExtension({
  id: "tau.link",
  elements: [
    defineElement<LinkElement>({
      type: "link",
      kind: "inline",
      isEmpty: element => element.children.length === 1 && element.children[0].text === "",
      render: ({ attributes, element, children }: ElementRenderProps<LinkElement>) => (
        <Link attributes={attributes} element={element}>
          {children}
        </Link>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
  commands: linkCommands,
  hotkeys: linkHotkeys,
});

export default linkExtension;
export type { LinkElement } from "./types";
export { wrapLink, unwrapLink } from "./operations";
