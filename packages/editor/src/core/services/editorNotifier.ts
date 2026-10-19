import type { Editor } from "slate";
import { captureEditorSubmission } from "../api/submission";

import { defaultEditorNotifier, type EditorNotifier } from "./notifier";
import { IEditorNotifier } from "./tokens";

const serviceOf = (editor: Editor): EditorNotifier =>
  editor.tryGetService?.(IEditorNotifier) ?? defaultEditorNotifier;

const notifiers = new WeakMap<Editor, EditorNotifier>();

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
      const request = captureEditorSubmission(editor, {
        signal: options.signal,
        services: [IEditorNotifier],
      });
      const service = serviceOf(editor);
      try {
        if (request.check()) return null;
        const result = await service.prompt({ ...options, signal: request.signal });
        return request.check() ? null : result;
      } finally {
        request.dispose();
      }
    },
  };
  notifiers.set(editor, notifier);
  return notifier;
}
