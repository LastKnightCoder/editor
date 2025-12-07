import { RenderElementProps } from "slate-react";
import HTMLBlock from "./components/HTMLBlock";

import type { HTMLBlockElement } from "../../types";

import Base from "../base";
import IExtension from "../types";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";
import blockPanelItems from "./block-panel-items";

class HtmlBlockExtension extends Base implements IExtension {
  type = "html-block";

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
    const { element, attributes, children } = props;
    return (
      <HTMLBlock element={element as HTMLBlockElement} attributes={attributes}>
        {children}
      </HTMLBlock>
    );
  }
}

export default HtmlBlockExtension;
