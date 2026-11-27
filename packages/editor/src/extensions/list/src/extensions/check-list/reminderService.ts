import type { ReactNode } from "react";
import type { Editor } from "slate";
import { createServiceId } from "@tau/editor/api";
import type { CheckListItemElement } from "../../types";

export interface CheckListItemReminderProps {
  editor: Editor;
  element: CheckListItemElement;
  readOnly: boolean;
}

export interface CheckListItemReminderService {
  renderTrailing(props: CheckListItemReminderProps): ReactNode;
}

/** 宿主按需注入正文勾选项尾部提醒控件，扩展与编辑器核心不依赖业务域。 */
export const ICheckListItemReminder =
  createServiceId<CheckListItemReminderService>("checkListItemReminder");
