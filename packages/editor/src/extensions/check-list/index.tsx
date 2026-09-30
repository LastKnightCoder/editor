import type { Element } from "slate";

import { defineElement, defineExtension } from "../../api";

import type { CheckListElement, CheckListItemElement } from "../../types";

import CheckList from "./components/CheckList";
import CheckListItem from "./components/CheckListItem";
import { checkListBehaviors, checkListItemBehaviors } from "./behaviors";
import { checkListCommands, checkListHotkeys } from "./commands";
import blockPanelItems from "./block-panel-items";

/** 勾选列表容器：子项（勾选项）参与拖拽，容器自身不拖 */
export const checkListExtension = defineExtension({
  id: "tau.check-list",
  elements: [
    defineElement<CheckListElement>({
      type: "check-list",
      kind: "block",
      render: CheckList,
      // 列表容器自身不拖（无手柄），只作为放置目标；子项（勾选项）有手柄
      drag: { self: false, children: true },
      behaviors: checkListBehaviors,
    }),
  ],
  blockPanel: blockPanelItems,
});

/**
 * 勾选项整体可拖，内部子内容不参与（段落不显示手柄——取代旧 disableDrag 数据字段）；
 * 只接受同类落进来，拖到勾选项内部任何位置都经过本谓词。
 */
export const checkListItemExtension = defineExtension({
  id: "tau.check-list-item",
  elements: [
    defineElement<CheckListItemElement>({
      type: "check-list-item",
      kind: "block",
      render: CheckListItem,
      drag: {
        self: true,
        children: false,
        accepts: (dragElement: Element) => dragElement.type === "check-list-item",
        handleClassName: "-left-[1.5em] top-[0.0625em]",
      },
      behaviors: checkListItemBehaviors,
    }),
  ],
  commands: checkListCommands,
  hotkeys: checkListHotkeys,
});
