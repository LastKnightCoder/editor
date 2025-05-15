import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { HTMLInlineElement } from "@/components/Editor/types";
import InlineHtml from "./components/InlineHtml";

import Base from "../base.ts";
import IExtension from "../types.ts";
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

  override toMarkdown(element: Element): string {
    const inlineHtmlElement = element as HTMLInlineElement;
    const { html } = inlineHtmlElement;
    return `${html}`;
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
