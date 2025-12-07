import { RenderElementProps } from "slate-react";
import type { HTMLInlineElement } from "../../types";
import InlineHtml from "./components/InlineHtml";

import Base from "../base";
import IExtension from "../types";
import {
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";
import blockPanelItems from "./block-panel-items";

class InlineHtmlExtension extends Base implements IExtension {
  type = "html-inline";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <InlineHtml
        attributes={attributes}
        element={element as HTMLInlineElement}
      >
        {children}
      </InlineHtml>
    );
  }
}

export default InlineHtmlExtension;
