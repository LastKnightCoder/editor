import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import "./augmentations";

import Link from "./components/Link.tsx";
import LinkPanelLayer from "./panel/LinkPanelLayer.tsx";
import { type LinkElement } from "./types.ts";

import hoveringBarConfigs from "./hovering-bar-configs/index.ts";
import { linkCommands, linkHotkeys } from "./commands.ts";
import { pasteUrl } from "./operations.ts";
import { isPastedUrl } from "./url.ts";

const linkExtension = defineExtension({
  id: "tau.link",
  elements: [
    defineElement<LinkElement>({
      type: "link",
      dataVersion: 1,
      kind: "inline",
      isEmpty: element => element.children.length === 1 && element.children[0].text === "",
      render: ({ attributes, element, children }: ElementRenderProps<LinkElement>) => (
        <Link attributes={attributes} element={element}>
          {children}
        </Link>
      ),
      ingest: {
        text: {
          when: data => isPastedUrl(data.getData("text/plain")),
          run: ({ editor, data }) => pasteUrl(editor, data.getData("text/plain")),
        },
      },
    }),
  ],
  layers: [LinkPanelLayer],
  toolbar: hoveringBarConfigs,
  commands: linkCommands,
  hotkeys: linkHotkeys,
});

export default linkExtension;
export type { LinkElement } from "./types";
export { wrapLink, unwrapLink } from "./operations";
export { openLinkPanel } from "./panel/controller";
