import { RenderElementProps } from "slate-react";
import Callout from "@/components/Editor/components/Callout";
import { CalloutElement } from "@/components/Editor/types";

import Base from '../base.ts';
import IExtension from "../types.ts";

class CalloutExtension extends Base implements IExtension {
  type = 'callout';
  override getPlugins() {
    return [];
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Callout element={element as CalloutElement} attributes={attributes}>{children}</Callout>;
  }
}

export default CalloutExtension;
