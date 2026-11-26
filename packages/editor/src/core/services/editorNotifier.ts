import { editorT, editorRuntime, requestRuntimeKey } from "../../i18n-runtime";
import type { Editor } from "slate";
import { captureEditorSubmission } from "../api/submission";

import {
  defaultEditorNotifier,
  type EditorNotifier,
  type EditorConfirmOptions,
  type EditorPromptOptions,
} from "./notifier";
import { IEditorNotifier } from "./tokens";

const serviceOf = (editor: Editor): EditorNotifier =>
  editor.tryGetService?.(IEditorNotifier) ?? defaultEditorNotifier;

function localizedOptions<T extends EditorConfirmOptions | EditorPromptOptions>(
  editor: Editor,
  options: T,
  prompt: boolean
): T {
  return Object.create(Object.getPrototypeOf(options), {
    ...Object.getOwnPropertyDescriptors(options),
    [requestRuntimeKey]: { value: editorRuntime(editor) },
    confirmText: {
      enumerable: true,
      get: () =>
        options.confirmText ?? editorT(editor, prompt ? "editorCommon.ok" : "editorCommon.confirm"),
    },
    cancelText: {
      enumerable: true,
      get: () => options.cancelText ?? editorT(editor, "editorCommon.cancel"),
    },
  });
}

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
    confirm: options => serviceOf(editor).confirm(localizedOptions(editor, options, false)),
    prompt: async options => {
      const request = captureEditorSubmission(editor, {
        signal: options.signal,
        services: [IEditorNotifier],
      });
      const service = serviceOf(editor);
      try {
        if (request.check()) return null;
        const forwarded = Object.create(Object.getPrototypeOf(options), {
          ...Object.getOwnPropertyDescriptors(localizedOptions(editor, options, true)),
          signal: { enumerable: true, value: request.signal },
        }) as EditorPromptOptions;
        const result = await service.prompt(forwarded);
        return request.check() ? null : result;
      } finally {
        request.dispose();
      }
    },
  };
  notifiers.set(editor, notifier);
  return notifier;
}
