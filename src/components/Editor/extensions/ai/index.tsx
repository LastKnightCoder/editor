import Base from "../base.ts";
import IExtension from "../types.ts";
import { AIElement } from "@editor/types/element/ai.ts";
import { RenderElementProps } from "slate-react";
import AIComponent from "./components/AIComponent";

import blockPanelItems from "./block-panel-items";

class AIExtension extends Base implements IExtension {
  type = "ai";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <AIComponent attributes={attributes} element={element as AIElement}>
        {children}
      </AIComponent>
    );
  }
}

export default AIExtension;
