import { RenderElementProps } from "slate-react";
import type { BulletedListElement } from "../../types";

import BulletedList from "./components/BulletedList";
import { markdownSyntax, withNormalize } from "./plugins";
import blockPanelItems from "./block-panle-items";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base";
import IExtension from "../types";

class BulletedListExtension extends Base implements IExtension {
  type = "bulleted-list";

  override getPlugins() {
    return [markdownSyntax, withNormalize, createBlockElementPlugin(this.type)];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <BulletedList
        element={element as BulletedListElement}
        attributes={attributes}
      >
        {children}
      </BulletedList>
    );
  }
}

export default BulletedListExtension;
