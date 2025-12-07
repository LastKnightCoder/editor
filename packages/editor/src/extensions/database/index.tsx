import { RenderElementProps } from "slate-react";

import Base from "../base";
import IExtension from "../types";
import type { DatabaseElement } from "../types";
import DatabaseBlock from "./components/DatabaseBlock";
import blockPanelItems from "./block-panel-items";
import { overwrite } from "./plugins";
import { createBlockElementPlugin, createVoidElementPlugin } from "../../utils";

class DatabaseExtension extends Base implements IExtension {
  type = "database";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [
      overwrite,
      createBlockElementPlugin(this.type),
      createVoidElementPlugin(this.type),
    ];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <DatabaseBlock
        element={element as unknown as DatabaseElement}
        attributes={attributes}
      >
        {children}
      </DatabaseBlock>
    );
  }
}

export default DatabaseExtension;
