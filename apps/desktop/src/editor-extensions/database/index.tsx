import { RenderElementProps } from "slate-react";
import { Base, IExtension } from "@tau/editor/src";
import DatabaseBlock from "./components/DatabaseBlock";
import blockPanelItems from "./block-panel-items";
import { overwrite } from "./plugins";
import type { DatabaseElement } from "./types";
export type { DatabaseElement } from "./types";
import { createBlockElementPlugin, createVoidElementPlugin } from "@tau/editor/src";

class DatabaseExtension extends Base implements IExtension {
  type = "database";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [overwrite, createBlockElementPlugin(this.type), createVoidElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <DatabaseBlock element={element as unknown as DatabaseElement} attributes={attributes}>
        {children}
      </DatabaseBlock>
    );
  }
}

export default DatabaseExtension;
