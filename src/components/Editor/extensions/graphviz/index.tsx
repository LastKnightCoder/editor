import { Element } from "slate";
import { GraphvizElement } from "@/components/Editor/types";
import Graphviz from "./components/Graphviz";

import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";

import Base from "../base.ts";
import IExtension from "../types.ts";

class GraphvizExtension extends Base implements IExtension {
  type = "graphviz";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override toMarkdown(element: Element): string {
    const graphvizEle = element as unknown as GraphvizElement;
    const { dot } = graphvizEle;
    return `\`\`\` graphviz\n${dot}\n\`\`\``;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return (
      <Graphviz element={element as GraphvizElement} attributes={attributes}>
        {children}
      </Graphviz>
    );
  }
}

export default GraphvizExtension;
