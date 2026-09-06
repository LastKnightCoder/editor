import { RenderElementProps } from "slate-react";
import type { InlineImageElement } from "../../types";
import { createInlineElementPlugin, createVoidElementPlugin } from "../../utils";
import IExtension from "../types";
import Base from "../base";
import InlineImage from "./components/InlineImage";
import { pasteInlineImagePlugin } from "./plugins";
import blockPanelItems from "./block-panel-items";

class InlineImageExtension extends Base implements IExtension {
  type = "inline-image";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      pasteInlineImagePlugin,
      createInlineElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <InlineImage element={element as InlineImageElement} attributes={attributes}>
        {children}
      </InlineImage>
    );
  }
}

export default InlineImageExtension;
