import { RenderElementProps } from "slate-react";

import { deleteBackward, insertBreak } from "./plugins";
import hotKeyConfigs from "@/components/Editor/hotkeys";
import Base from '../base.ts';
import IExtension from "../types.ts";

class ListItemExtension extends Base implements IExtension {
  override type = 'list-item';
  override getPlugins() {
    return [deleteBackward, insertBreak];
  }

  override getHotkeyConfigs() {
    return hotKeyConfigs;
  }
  render(props: RenderElementProps) {
    const { attributes, children } = props;
    return <li {...attributes}>{children}</li>;
  }
}

export default ListItemExtension;