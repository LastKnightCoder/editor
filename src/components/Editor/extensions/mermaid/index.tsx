import loadable from "@loadable/component";
import { MermaidElement } from "@/components/Editor/types";

import Base from '../base';
import IExtension from "../types.ts";
import {RenderElementProps} from "slate-react";

const MermaidChart = loadable(() => import("@/components/Editor/components/MermaidChart"));

class MermaidExtension extends Base implements IExtension {
  type = 'mermaid';

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <MermaidChart element={element as MermaidElement} attributes={attributes}>
        {children}
      </MermaidChart>
    )
  }
}

export default MermaidExtension;
