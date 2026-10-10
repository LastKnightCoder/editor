import type { ParagraphElement } from "@tau/editor/api";
import type { DocumentTaskAttributes } from "@tau/shared/task-assistant";

export interface CheckListItemElement extends DocumentTaskAttributes {
  type: "check-list-item";
  checked: boolean;
  /** 勾选项的稳定身份（文档内唯一），供文档待办定位与回写；缺失或重复时由规范化补齐 */
  taskId?: string;
  /** 相对日期首次解析的正文元信息，随正文同步并参与索引重建。 */
  taskDateAnchor?: { hint: string; at: number; date: string } | null;
  /** 项目词的归属提示，解决项目改名后旧名被其它项目复用的歧义。 */
  taskGroup?: { id: number; token: string; createdAt?: number } | null;
  children: [ParagraphElement] | [ParagraphElement, CheckListElement];
}

export interface CheckListElement {
  type: "check-list";
  children: CheckListItemElement[];
}
