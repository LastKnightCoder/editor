import { RenderElementProps } from "slate-react";

import ListItem from './components/ListItem';
import { deleteBackward, insertBreak, withNormalize } from "./plugins";
import hotKeyConfigs from "./hotkeys";
import Base from '../base.ts';
import IExtension from "../types.ts";
import { ListItemElement } from "@/components/Editor/types";

class ListItemExtension extends Base implements IExtension {
  type = 'list-item';
  override getPlugins() {
    return [deleteBackward, insertBreak, withNormalize];
  }

  override getHotkeyConfigs() {
    return hotKeyConfigs;
  }
  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return <ListItem attributes={attributes} element={element as ListItemElement}>{children}</ListItem>;
  }
}

export default ListItemExtension;