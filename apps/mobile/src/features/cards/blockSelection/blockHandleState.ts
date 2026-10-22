import type { Editor } from "slate";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";

/** 长按把手进入块选择的时长 */
export const HANDLE_LONG_PRESS_MS = 450;

type HandleController = Pick<
  MobileEditorToolbarController,
  "isEditorFocused" | "activePanel" | "isTableMenuOpen" | "editingContext"
>;

/**
 * 把手所在的顶层块下标：编辑态、编辑器聚焦、配件栏为通用或格式模式（无面板、无表格菜单、
 * 不在表格 / 代码块 / 公式等上下文）时取光标所在顶层块，否则为 null。
 */
export function resolveHandleBlockIndex(
  editor: Editor | null,
  editing: boolean,
  controller: HandleController
): number | null {
  if (!editor || !editing || !controller.isEditorFocused) return null;
  if (controller.activePanel !== null || controller.isTableMenuOpen) return null;
  const { kind } = controller.editingContext;
  if (kind !== "text" && kind !== "selection") return null;
  const index = editor.selection?.anchor.path[0];
  return index === undefined || index >= editor.children.length ? null : index;
}
