import IExtension from "../types.ts";
import Base from "../base.ts";
import Link from "./components/Link.tsx";

import { RenderElementProps } from "slate-react";
import { LinkElement } from "@/components/Editor/types";

import hotkeys from "./hotkeys";
import hoveringBarConfigs from "./hovering-bar-configs";
import { createInlineElementPlugin } from "../../utils";

class LinkExtension extends Base implements IExtension {
  type = "link";

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  override getPlugins() {
    return [createInlineElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Link attributes={attributes} element={element as LinkElement}>
        {children}
      </Link>
    );
  }
}

export default LinkExtension;
