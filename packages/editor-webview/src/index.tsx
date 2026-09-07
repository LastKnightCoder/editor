import { RenderElementProps } from "slate-react";
import { Base, IExtension, createVoidElementPlugin, createBlockElementPlugin } from "@tau/editor";
import type { WebviewElement } from "./types";
import type {} from "./augmentations";

import WebviewComponent from "./WebviewComponent";
import blockPanelItems from "./block-panel-items";

export class WebviewExtension extends Base implements IExtension {
  type = "webview";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { element, children, attributes } = props;

    return (
      <WebviewComponent element={element as unknown as WebviewElement} attributes={attributes}>
        {children}
      </WebviewComponent>
    );
  }
}

export default WebviewExtension;

export type { WebviewElement } from "./types";
export { WebLinkSourceType } from "./types";
export { insertWebview } from "./utils";
