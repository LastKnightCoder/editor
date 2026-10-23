import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import type { WebviewElement } from "./types";
import "./augmentations";

import WebviewComponent from "./WebviewComponent";
import blockPanelItems from "./block-panel-items";
import { webviewCommands, webviewMenuItems } from "./menu";

const webviewExtension = defineExtension({
  id: "tau.webview",
  elements: [
    defineElement<WebviewElement>({
      type: "webview",
      kind: "block",
      isVoid: true,
      render: ({ attributes, element, children }: ElementRenderProps<WebviewElement>) => (
        <WebviewComponent element={element} attributes={attributes}>
          {children}
        </WebviewComponent>
      ),
      drag: true,
    }),
  ],
  blockPanel: blockPanelItems,
  commands: webviewCommands,
  menu: webviewMenuItems,
});

export default webviewExtension;

export type { WebviewElement } from "./types";
export { WebLinkSourceType } from "./types";
export { insertWebview } from "./utils";
export { normalizeWebviewUrl } from "./utils/url";
