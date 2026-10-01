import { Transforms } from "slate";

import type { ElementBehaviors } from "@tau/editor/api";
import type { ListItemElement } from "../../types";
import { hitEmptyOrInlineChild } from "../../normalization";
import { deleteListItem, newLineInListItem } from "./utils";

export const listItemBehaviors: ElementBehaviors<ListItemElement> = {
  insertBreak: editor =>
    // 非空首段回车需要先默认拆行再包成新 list-item：Slate 默认回车就是
    // splitNodes({always:true})，与旧插件调原链 insertBreak 等价（旧链里更早
    // 应用的扩展没有 insertBreak 改写）
    newLineInListItem(editor, () => {
      Transforms.splitNodes(editor, { always: true });
    }),
  deleteBackward: editor => deleteListItem(editor),
  normalize: (editor, entry) => hitEmptyOrInlineChild(editor, entry, "list-item"),
};
