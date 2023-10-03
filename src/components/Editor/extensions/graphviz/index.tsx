import { GraphvizElement } from "@/components/Editor/types";
import Graphviz from "@/components/Editor/components/Graphviz";

import { RenderElementProps } from "slate-react";

import Base from '../base.ts';
import IExtension from "../types.ts";

class GraphvizExtension extends Base implements IExtension {
  type = 'graphviz';

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Graphviz element={element as GraphvizElement} attributes={attributes}>{children}</Graphviz>;
  }
}

export default GraphvizExtension;