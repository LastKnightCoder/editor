import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import HTMLBlock from "./components/HTMLBlock";

import { HTMLBlockElement } from "@/components/Editor/types";

import Base from "../base.ts";
import IExtension from "../types.ts";
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

  override toMarkdown(element: Element): string {
    const htmlBlockElement = element as HTMLBlockElement;
    const { html } = htmlBlockElement;

    return html;
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
