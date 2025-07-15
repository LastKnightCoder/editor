import { RenderElementProps } from "slate-react";

import {
  CheckListElement,
  CheckListItemElement,
} from "@/components/Editor/types";

import CheckList from "./components/CheckList";
import CheckListItem from "./components/CheckListItem";
import { insertBreak, deleteBackward, withNormalize } from "./plugins";
import blockPanelItems from "./block-panel-items";
import hotkeys from "./hotkeys";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base";
import IExtension from "../types.ts";

export class CheckListExtension extends Base implements IExtension {
  type = "check-list";

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  override getPlugins() {
    return [withNormalize, createBlockElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <CheckList element={element as CheckListElement} attributes={attributes}>
        {children}
      </CheckList>
    );
  }
}

export class CheckListItemExtension extends Base implements IExtension {
  type = "check-list-item";

  override getPlugins() {
    return [insertBreak, deleteBackward, createBlockElementPlugin(this.type)];
  }

  override getHotkeyConfigs() {
    return hotkeys;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <CheckListItem
        element={element as CheckListItemElement}
        attributes={attributes}
      >
        {children}
      </CheckListItem>
    );
  }
}
