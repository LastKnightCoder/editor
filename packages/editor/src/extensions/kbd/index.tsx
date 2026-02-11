import { RenderElementProps } from "slate-react";

import type { IConfigItem, KbdElement } from "../../types";
import Base from "../base";
import IExtension from "../types";
import { createInlineElementPlugin } from "../../utils";

import Kbd from "./components/Kbd";
import hoveringBarConfigs from "./hovering-bar-configs";

class KbdExtension extends Base implements IExtension {
  override type = "kbd";

  override getHoveringBarElements(): IConfigItem[] {
    return hoveringBarConfigs;
  }

  override getPlugins() {
    return [createInlineElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Kbd attributes={attributes} element={element as KbdElement}>
        {children}
      </Kbd>
    );
  }
}

export default KbdExtension;
