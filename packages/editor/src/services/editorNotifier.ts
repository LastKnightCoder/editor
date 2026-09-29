import type { Editor } from "slate";

import { defaultEditorNotifier, type EditorNotifier } from "./notifier";
import { IEditorNotifier } from "./tokens";

/** 非 React 代码（插件、快捷键、粘贴 / 拖放）取提示服务 */
export const notifierOf = (editor: Editor): EditorNotifier =>
  editor.tryGetService?.(IEditorNotifier) ?? defaultEditorNotifier;
