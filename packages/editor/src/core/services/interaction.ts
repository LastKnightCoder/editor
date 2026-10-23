import { createServiceId } from "@tau/shared/service-contract";
import type { Editor } from "slate";
import { useOptionalService } from "./hooks";

/** 宿主声明的输入方式：决定带悬停 / 拖拽手柄的块是否改用触屏交互 */
export interface EditorInteraction {
  /** 触屏宿主：块不渲染悬停属性条与缩放手柄，选中改由 Slate 选区表达，操作交给宿主工具栏 */
  touch: boolean;
}

/** 未注册时按桌面（鼠标）交互 */
export const IEditorInteraction = createServiceId<EditorInteraction>("tau.host.interaction");

/** 当前编辑器是否处于触屏交互模式 */
export function useTouchInteraction(): boolean {
  return useOptionalService(IEditorInteraction)?.touch === true;
}

/** 非 React 场景（命令、菜单）读取触屏交互模式 */
export function isTouchInteraction(editor: Editor): boolean {
  return editor.tryGetService?.(IEditorInteraction)?.touch === true;
}
