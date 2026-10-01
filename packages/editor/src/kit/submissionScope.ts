import type { Editor } from "slate";

interface SubmissionScope {
  controller: AbortController;
  active: boolean;
}

const scopes = new WeakMap<Editor, SubmissionScope>();
const serviceChecks = new WeakMap<Editor, Set<() => void>>();

export function watchSubmissionServices(editor: Editor, check: () => void) {
  const checks = serviceChecks.get(editor) ?? new Set<() => void>();
  serviceChecks.set(editor, checks);
  checks.add(check);
  return () => {
    checks.delete(check);
  };
}

export function notifySubmissionServices(editor: Editor) {
  for (const check of serviceChecks.get(editor) ?? []) check();
}

export function endSubmissionScope(editor: Editor) {
  const scope = scopes.get(editor);
  if (!scope) return;
  scope.active = false;
  scope.controller.abort();
}

export function initializeSubmissionScope(editor: Editor) {
  const controller = new AbortController();
  controller.abort();
  scopes.set(editor, { controller, active: false });
}

export function beginSubmissionScope(editor: Editor) {
  endSubmissionScope(editor);
  scopes.set(editor, { controller: new AbortController(), active: true });
  return () => endSubmissionScope(editor);
}

/** 纯 Slate 宿主通过操作的 signal 提供生命周期；React 编辑器始终使用已登记会话。 */
export const submissionScopeSignal = (editor: Editor): AbortSignal | undefined =>
  scopes.get(editor)?.controller.signal;
