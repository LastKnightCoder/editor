import { RenderElementProps } from "slate-react";
import type { NumberedListElement } from "../../types";

import NumberedList from "./components/NumberedList";
import { markdownSyntax, withNormalize } from "./plugins";
import blockPanelItems from "./block-panel-items";
import { createBlockElementPlugin } from "../../utils";
import Base from "../base";
import IExtension from "../types";

class NumberedListExtension extends Base implements IExtension {
  type = "numbered-list";
  override getPlugins() {
    return [withNormalize, markdownSyntax, createBlockElementPlugin(this.type)];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <NumberedList
        element={element as NumberedListElement}
        attributes={attributes}
      >
        {children}
      </NumberedList>
    );
  }
}

export default NumberedListExtension;
