import { Element } from "slate";
import { RenderElementProps } from "slate-react";

import HighlightBlock from "./components/HighlightBlock";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { HighlightBlockElement } from "@/components/Editor/types";

import blockPanelItems from "./block-panel-items";
import { quit, withNormalize } from "./plugins";
import { createBlockElementPlugin } from "../../utils";
class HighlightBlockExtension extends Base implements IExtension {
  type = "highlight-block";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [quit, withNormalize, createBlockElementPlugin(this.type)];
  }

  override toMarkdown(element: Element, children: string): string {
    return `:::highlight-block{color=${(element as HighlightBlockElement).color}${(element as HighlightBlockElement).color}\n${children}\n:::`;
  }

  render(props: RenderElementProps) {
    const { attributes, element, children } = props;

    return (
      <HighlightBlock
        attributes={attributes}
        element={element as HighlightBlockElement}
      >
        {children}
      </HighlightBlock>
    );
  }
}

export default HighlightBlockExtension;
