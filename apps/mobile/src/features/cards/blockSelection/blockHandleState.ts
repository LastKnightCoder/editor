import type { Editor } from "slate";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";

/** 长按把手提起拖拽的时长 */
export const HANDLE_DRAG_DELAY_MS = 300;
/** 长按期间指针移动超过该距离（px）视为取消，不拖也不点击 */
export const HANDLE_DRAG_CANCEL_DISTANCE = 8;

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
