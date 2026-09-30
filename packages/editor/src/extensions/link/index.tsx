import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import Link from "./components/Link.tsx";
import type { LinkElement } from "../../types";

import hoveringBarConfigs from "./hovering-bar-configs";
import { linkCommands, linkHotkeys } from "./commands";

const linkExtension = defineExtension({
  id: "tau.link",
  elements: [
    defineElement<LinkElement>({
      type: "link",
      kind: "inline",
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
