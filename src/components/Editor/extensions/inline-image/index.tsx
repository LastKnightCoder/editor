import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { InlineImageElement } from "@/components/Editor/types";
import {
  createInlineElementPlugin,
  createVoidElementPlugin,
} from "../../utils";
import IExtension from "../types.ts";
import Base from "../base.ts";
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

  override toMarkdown(element: Element): string {
    const { url, alt } = element as InlineImageElement;
    return `![${alt || ""}](${url})`;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <InlineImage
        element={element as InlineImageElement}
        attributes={attributes}
      >
        {children}
      </InlineImage>
    );
  }
}

export default InlineImageExtension;
