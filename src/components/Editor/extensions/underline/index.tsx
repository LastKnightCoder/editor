import { RenderElementProps } from "slate-react";

import Underline from "./components/Underline";
import { UnderlineElement } from "@/components/Editor/types";

import Base from "../base.ts";
import IExtension from "../types.ts";
import { createInlineElementPlugin } from "../../utils";

import hoveringBarConfigs from "./hovering-bar-configs";

class UnderlineExtension extends Base implements IExtension {
  type = "underline";

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  override getPlugins() {
    return [createInlineElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <Underline
        element={element as unknown as UnderlineElement}
        attributes={attributes}
      >
        {children}
      </Underline>
    );
  }
}

export default UnderlineExtension;
