import type { ParagraphElement } from "@tau/editor/api";

export interface CheckListItemElement {
  type: "check-list-item";
  checked: boolean;
  /** 勾选项的稳定身份（文档内唯一），供文档待办定位与回写；缺失或重复时由规范化补齐 */
  taskId?: string;
  children: [ParagraphElement] | [ParagraphElement, CheckListElement];
}

export interface CheckListElement {
  type: "check-list";
  children: CheckListItemElement[];
}
