import { RenderElementProps } from "slate-react";
import { Element } from "slate";
import Base from "../base";
import IExtension from "../types";
import { WebviewElement } from "../../types";

import WebviewComponent from "./WebviewComponent";
import blockPanelItems from "./block-panel-items";

class WebviewExtension extends Base implements IExtension {
  type = "webview";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  toMarkdown(element: Element): string {
    const webviewElement = element as unknown as WebviewElement;
    const { url, height } = webviewElement;
    return `<iframe src="${url}" width="100%" height="${height}" frameborder="0"></iframe>`;
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
