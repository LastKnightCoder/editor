import IExtension from "../types.ts";
import Base from "../base.ts";
import Link from "./components/Link"
import {RenderElementProps} from "slate-react";
import {LinkElement} from "@/components/Editor/types";
import hotkeys from "./hotkeys";

class LinkExtension extends Base implements IExtension {
  type = 'link';

  override getHotkeyConfigs() {
    return hotkeys;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Link attributes={attributes} element={element as LinkElement}>
        {children}
      </Link>
    )
  }
}

export default LinkExtension;