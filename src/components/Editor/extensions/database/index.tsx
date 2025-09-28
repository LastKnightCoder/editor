import { RenderElementProps } from "slate-react";

import Base from "@/components/Editor/extensions/base";
import IExtension from "@/components/Editor/extensions/types";
import { DatabaseElement } from "@/components/Editor/types";
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
