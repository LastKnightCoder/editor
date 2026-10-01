import type { Editor } from "slate";
import { ReactEditor } from "slate-react";

import { defaultEditorNotifier, type EditorNotifier } from "./notifier";
import { IEditorNotifier } from "./tokens";

const serviceOf = (editor: Editor): EditorNotifier =>
  editor.tryGetService?.(IEditorNotifier) ?? defaultEditorNotifier;

const notifiers = new WeakMap<Editor, EditorNotifier>();
const prompts = new WeakMap<Editor, Set<AbortController>>();

/** 只结束该编辑器发起的输入请求，不影响同页其他编辑器。 */
export function cancelEditorPrompts(editor: Editor) {
  for (const controller of prompts.get(editor) ?? []) controller.abort();
  prompts.delete(editor);
}

/** 提示服务按编辑器绑定；服务派生后继续读取当前作用域。 */
export function notifierOf(editor: Editor): EditorNotifier {
  let notifier = notifiers.get(editor);
  if (notifier) return notifier;
  notifier = {
    success: message => serviceOf(editor).success(message),
    error: message => serviceOf(editor).error(message),
    warning: message => serviceOf(editor).warning(message),
    loading: message => serviceOf(editor).loading(message),
    confirm: options => serviceOf(editor).confirm(options),
    prompt: async options => {
      if (options.signal?.aborted || ReactEditor.isReadOnly(editor)) return null;
      try {
        if (!ReactEditor.toDOMNode(editor, editor).isConnected) return null;
      } catch {
        return null;
      }
      const controller = new AbortController();
      const pending = prompts.get(editor) ?? new Set<AbortController>();
      prompts.set(editor, pending);
      pending.add(controller);
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        const result = await serviceOf(editor).prompt({ ...options, signal: controller.signal });
        return controller.signal.aborted ? null : result;
      } finally {
        options.signal?.removeEventListener("abort", abort);
        pending.delete(controller);
        if (prompts.get(editor) === pending && !pending.size) prompts.delete(editor);
      }
    },
  };
  notifiers.set(editor, notifier);
  return notifier;
}
