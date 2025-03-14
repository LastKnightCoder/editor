import loadable from "@loadable/component";
import { MermaidElement } from "@/components/Editor/types";

import Base from "../base";
import IExtension from "../types.ts";
import { Element } from "slate";
import { RenderElementProps } from "slate-react";

import blockPanelItems from "./block-panel-items";
const MermaidChart = loadable(() => import("./components/MermaidChart"));

class MermaidExtension extends Base implements IExtension {
  type = "mermaid";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override toMarkdown(element: Element): string {
    const { chart } = element as MermaidElement;
    return `\`\`\`mermaid\n${chart}\n\`\`\``;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <MermaidChart element={element as MermaidElement} attributes={attributes}>
        {children}
      </MermaidChart>
    );
  }
}

export default MermaidExtension;
