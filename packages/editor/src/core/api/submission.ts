import { canEditElement } from "./elementVersions";
import { Editor, Element, Node, Path, Range, type BaseRange } from "slate";
import { ReactEditor } from "slate-react";
import { getCommandElementPath } from "../utils/commandTarget";
import { submissionScopeSignal, watchSubmissionServices } from "../kit/submissionScope";
import type { ServiceIdentifier } from "../services/tokens";

interface SubmissionOptions {
  signal?: AbortSignal;
  /** 只跟踪本操作依赖的服务；无关主题或插槽派生不取消操作。 */
  services?: readonly ServiceIdentifier<unknown>[];
}

export type SubmissionDiscardReason =
  | "cancelled"
  | "scope-ended"
  | "readonly"
  | "target-lost"
  | "target-changed";
export type SubmissionOutcome =
  | { status: "committed" }
  | { status: "discarded"; reason: SubmissionDiscardReason };

export interface Submission<T> {
  readonly signal: AbortSignal;
  /** 失效时终结操作并释放引用；不能放进要求纯判断的表单 validate。 */
  check(): SubmissionDiscardReason | undefined;
  /** 只提交一次；回调必须同步，异常向上传播，不能依赖事务回滚。 */
  commit(write: (target: T) => undefined): SubmissionOutcome;
  dispose(): void;
}

interface Located<T> {
  target: T;
}
interface Invalid {
  reason: SubmissionDiscardReason;
}

function createSubmission<T>(
  editor: Editor,
  signal: AbortSignal | undefined,
  locate: () => Located<T> | Invalid,
  release: () => void = () => undefined,
  services: readonly ServiceIdentifier<unknown>[] = []
): Submission<T> {
  const scope = submissionScopeSignal(editor);
  const controller = new AbortController();
  let invalid: SubmissionDiscardReason | undefined;
  let released = false;
  let stopWatching: (() => void) | undefined;
  let dependencies: Array<{ id: ServiceIdentifier<unknown>; value: unknown }>;
  try {
    dependencies = scope?.aborted
      ? []
      : services.map(id => ({ id, value: editor.tryGetService?.(id) }));
  } catch (error) {
    release();
    throw error;
  }
  const cleanup = () => {
    if (released) return;
    released = true;
    scope?.removeEventListener("abort", onScopeEnd);
    signal?.removeEventListener("abort", onCancel);
    stopWatching?.();
    release();
  };
  const invalidate = (reason: SubmissionDiscardReason) => {
    invalid ??= reason;
    cleanup();
    controller.abort();
  };
  const onScopeEnd = () => invalidate("scope-ended");
  const onCancel = () => invalidate("cancelled");
  const checkServices = () => {
    try {
      if (dependencies.some(({ id, value }) => editor.tryGetService?.(id) !== value))
        invalidate("scope-ended");
    } catch (error) {
      invalidate("cancelled");
      throw error;
    }
  };
  if (services.length) stopWatching = watchSubmissionServices(editor, checkServices);
  scope?.addEventListener("abort", onScopeEnd, { once: true });
  signal?.addEventListener("abort", onCancel, { once: true });
  if (scope?.aborted) onScopeEnd();
  else if (signal?.aborted) onCancel();

  const inspect = (): Located<T> | Invalid => {
    if (invalid) return { reason: invalid };
    checkServices();
    if (invalid) return { reason: invalid };
    if (ReactEditor.isReadOnly(editor)) {
      invalidate("readonly");
      return { reason: "readonly" };
    }
    let result: Located<T> | Invalid;
    try {
      result = locate();
    } catch (error) {
      invalidate("cancelled");
      throw error;
    }
    if ("reason" in result) invalidate(result.reason);
    return result;
  };
  return {
    signal: controller.signal,
    check: () => {
      const result = inspect();
      return "reason" in result ? result.reason : undefined;
    },
    commit: write => {
      const result = inspect();
      if ("reason" in result) return { status: "discarded", reason: result.reason };
      try {
        const returned = write(result.target);
        if (returned !== undefined) {
          void Promise.resolve(returned).catch(() => undefined);
          throw new Error("[editor] 异步提交回调必须同步返回 undefined");
        }
        return { status: "committed" };
      } finally {
        invalidate("cancelled");
      }
    },
    dispose: onCancel,
  };
}

/** 无元素目标的输入请求只绑定编辑会话和调用方取消信号。 */
export const captureEditorSubmission = (
  editor: Editor,
  options: SubmissionOptions = {}
): Submission<void> =>
  createSubmission(
    editor,
    options.signal,
    () => ({ target: undefined }),
    undefined,
    options.services
  );

export function captureElementSubmission<E extends Element>(
  editor: Editor,
  options: SubmissionOptions & { element: E; path?: Path; accept?: (current: E) => boolean }
): Submission<{ element: E; path: Path }> {
  const path = getCommandElementPath(editor, options);
  const reference = path ? Editor.pathRef(editor, path) : null;
  return createSubmission<{ element: E; path: Path }>(
    editor,
    options.signal,
    () => {
      const currentPath = reference?.current;
      if (!currentPath || !Node.has(editor, currentPath)) return { reason: "target-lost" };
      const node = Node.get(editor, currentPath);
      if (!Element.isElement(node) || node.type !== options.element.type)
        return { reason: "target-changed" };
      const current = node as E;
      const accepted = options.accept ? options.accept(current) : current === options.element;
      if (typeof accepted !== "boolean") {
        void Promise.resolve(accepted).catch(() => undefined);
        throw new Error("[editor] 提交条件必须同步返回 boolean");
      }
      if (!accepted) return { reason: "target-changed" };
      if (!canEditElement(editor, node)) return { reason: "readonly" };
      return { target: { element: current, path: currentPath } };
    },
    () => reference?.unref(),
    options.services
  );
}

/** 段落内的原始折叠落点；后续选区变化不会改写该落点。 */
export function captureInsertionSubmission(
  editor: Editor,
  signal?: AbortSignal
): Submission<{ range: BaseRange; path: Path }> {
  const selection = editor.selection;
  const entry =
    selection && Range.isCollapsed(selection)
      ? Editor.above(editor, {
          at: selection.anchor,
          match: node => Element.isElement(node) && node.type === "paragraph",
        })
      : undefined;
  const paragraph = entry ? Editor.pathRef(editor, entry[1]) : null;
  const range =
    entry && selection ? Editor.rangeRef(editor, selection, { affinity: "forward" }) : null;
  return createSubmission<{ range: BaseRange; path: Path }>(
    editor,
    signal,
    () => {
      const path = paragraph?.current;
      const current = range?.current;
      if (!path || !current || !Node.has(editor, path)) return { reason: "target-lost" };
      if (
        Node.get(editor, path).type !== "paragraph" ||
        !Range.isCollapsed(current) ||
        !Path.isAncestor(path, current.anchor.path)
      )
        return { reason: "target-changed" };
      return { target: { range: current, path } };
    },
    () => {
      paragraph?.unref();
      range?.unref();
    }
  );
}
