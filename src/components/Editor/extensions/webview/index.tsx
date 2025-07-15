import { RenderElementProps } from "slate-react";
import Base from "../base";
import IExtension from "../types";
import { WebviewElement } from "../../types";

import WebviewComponent from "./WebviewComponent";
import blockPanelItems from "./block-panel-items";
import { createVoidElementPlugin, createBlockElementPlugin } from "../../utils";

class WebviewExtension extends Base implements IExtension {
  type = "webview";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, children, attributes } = props;

    return (
      <WebviewComponent
        element={element as unknown as WebviewElement}
        attributes={attributes}
      >
        {children}
      </WebviewComponent>
    );
  }
}

export default WebviewExtension;
