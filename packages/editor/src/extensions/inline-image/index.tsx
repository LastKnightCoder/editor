import { RenderElementProps } from "slate-react";
import type { InlineImageElement } from "../../types";
import { createInlineElementPlugin, createVoidElementPlugin } from "../../utils";
import IExtension from "../types";
import Base from "../base";
import InlineImage from "./components/InlineImage";
import blockPanelItems from "./block-panel-items";

// 粘贴认领（非空段落插行内图）由 image 扩展的 ingest 统一承担（01 §5.4）

class InlineImageExtension extends Base implements IExtension {
  type = "inline-image";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [createInlineElementPlugin(this.type), createVoidElementPlugin(this.type)];
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
