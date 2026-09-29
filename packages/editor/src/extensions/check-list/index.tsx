import { RenderElementProps } from "slate-react";
import type { Element } from "slate";

import { CheckListElement, CheckListItemElement } from "../../types";

import CheckList from "./components/CheckList";
import CheckListItem from "./components/CheckListItem";
import { insertBreak, deleteBackward, withNormalize } from "./plugins";
import blockPanelItems from "./block-panel-items";
import hotkeys from "./hotkeys";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base";
import IExtension from "../types";

export class CheckListExtension extends Base implements IExtension {
  type = "check-list";

  /** 列表容器自身不拖（无手柄），只作为放置目标；子项（勾选项）有手柄 */
  override dragSpec = { self: false, children: true };

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

  /**
   * 勾选项整体可拖，内部子内容不参与（段落不显示手柄——取代旧 disableDrag 数据字段）；
   * 只接受同类落进来，拖到勾选项内部任何位置都经过本谓词。
   */
  override dragSpec = {
    self: true,
    children: false,
    accepts: (dragElement: Element) => dragElement.type === "check-list-item",
    handleClassName: "-left-[1.5em] top-[0.0625em]",
  };

  override getPlugins() {
    return [insertBreak, deleteBackward, createBlockElementPlugin(this.type)];
  }

  override getHotkeyConfigs() {
    return hotkeys;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <CheckListItem element={element as CheckListItemElement} attributes={attributes}>
        {children}
      </CheckListItem>
    );
  }
}
