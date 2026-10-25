import type { EditorTextField, TextFieldDelta } from "../../../text-field-contract";

interface Edit {
  offset: number;
  remove: number;
  text: string;
}

function difference(before: string, after: string): Edit {
  let start = 0,
    suffix = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before.at(-1 - suffix) === after.at(-1 - suffix)
  )
    suffix++;
  return {
    offset: start,
    remove: before.length - start - suffix,
    text: after.slice(start, after.length - suffix),
  };
}

function edits(delta: readonly TextFieldDelta[]): Edit[] {
  let offset = 0;
  const result: Edit[] = [];
  for (const part of delta) {
    offset += part.retain ?? 0;
    if (part.delete) result.push({ offset, remove: part.delete, text: "" });
    if (part.insert) {
      result.push({ offset, remove: 0, text: part.insert });
      offset += part.insert.length;
    }
  }
  return result;
}

const movePoint = (point: number, edit: Edit) =>
  point < edit.offset
    ? point
    : point >= edit.offset + edit.remove
      ? point + edit.text.length - edit.remove
      : edit.offset + edit.text.length;

/** 输入法期间的替换只删除开始组合时已存在的字符，保留期间到达的远端插入。 */
export function rebaseTextFieldInput(local: Edit, remote: readonly Edit[]): Edit[] {
  let anchor = local.offset;
  let ranges = local.remove ? [[local.offset, local.offset + local.remove]] : [];
  for (const change of remote) {
    anchor = movePoint(anchor, change);
    ranges = ranges.flatMap(([start, end]) => {
      const next: number[][] = [];
      const leftEnd = Math.min(end, change.offset);
      if (start < leftEnd) next.push([start, leftEnd]);
      const rightStart = Math.max(start, change.offset + change.remove);
      if (rightStart < end)
        next.push([
          rightStart + change.text.length - change.remove,
          end + change.text.length - change.remove,
        ]);
      return next;
    });
  }
  const insertion =
    anchor -
    ranges.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(anchor, end) - start), 0);
  return [
    ...ranges
      .slice()
      .reverse()
      .map(([start, end]) => ({ offset: start, remove: end - start, text: "" })),
    ...(local.text ? [{ offset: insertion, remove: 0, text: local.text }] : []),
  ];
}

/** 原生输入控件立即消费字段增量，避免 React 渲染时序把旧整段文本写回共享正文。 */
export function bindTextFieldTextarea(
  input: HTMLTextAreaElement | HTMLInputElement,
  field: EditorTextField,
  onValue: (value: string) => void,
  onError: (message: string) => void
) {
  let snapshot = field.getSnapshot();
  let writing = false,
    composing = false,
    failed = false,
    closed = false;
  let compositionBase = snapshot.value;
  let pending: Edit[] = [];
  input.value = snapshot.value;
  onValue(input.value);
  const fail = (error: unknown) => {
    try {
      field.preserveDraft?.({ value: input.value, revision: snapshot.revision });
    } catch {
      /* 保留输入框草稿，交由宿主保存错误提示。 */
    }
    failed = true;
    input.readOnly = true;
    onError(
      `${error instanceof Error ? error.message : "源码同步失败"}；输入框保留了未提交草稿，请先复制。`
    );
    onValue(input.value);
  };
  const write = (next: string) => {
    if (closed || failed) return;
    const selection = {
      start: input.selectionStart ?? 0,
      end: input.selectionEnd ?? 0,
      direction: input.selectionDirection ?? "none",
    };
    input.value = next;
    input.setSelectionRange(selection.start, selection.end, selection.direction);
    try {
      const local = difference(composing ? compositionBase : snapshot.value, next);
      const changes = composing ? rebaseTextFieldInput(local, pending) : [local];
      writing = true;
      try {
        field.editBatch(changes, snapshot.revision);
      } finally {
        writing = false;
      }
      snapshot = field.getSnapshot();
      input.value = snapshot.value;
      const cursor = composing
        ? changes.reduce(movePoint, pending.reduce(movePoint, local.offset))
        : selection.start;
      input.setSelectionRange(cursor, composing ? cursor : selection.end, selection.direction);
      onValue(snapshot.value);
    } catch (error) {
      fail(error);
    }
  };
  const inputChanged = () => {
    if (composing) {
      try {
        field.preserveDraft?.({ value: input.value, revision: snapshot.revision });
      } catch (error) {
        fail(error);
      }
      onValue(input.value);
      return;
    }
    write(input.value);
  };
  const compositionStart = () => {
    composing = true;
    compositionBase = snapshot.value;
    pending = [];
  };
  const compositionEnd = () => {
    if (!composing) return;
    write(input.value);
    composing = false;
    pending = [];
  };
  const stop = field.subscribe(event => {
    if (closed || writing || failed) return;
    try {
      const changes = edits(event.delta);
      if (composing) {
        pending.push(...changes);
        snapshot = field.getSnapshot();
        return;
      }
      let next = snapshot.value,
        start = input.selectionStart ?? 0,
        end = input.selectionEnd ?? 0;
      for (const change of changes) {
        next =
          next.slice(0, change.offset) + change.text + next.slice(change.offset + change.remove);
        start = movePoint(start, change);
        end = movePoint(end, change);
      }
      snapshot = field.getSnapshot();
      if (next !== snapshot.value) throw new Error("源码投影不一致");
      const direction = input.selectionDirection ?? "none";
      input.value = next;
      input.setSelectionRange(start, end, direction);
      onValue(next);
    } catch (error) {
      fail(error);
    }
  });
  const historyKey = (inputEvent: Event) => {
    const event = inputEvent as KeyboardEvent;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      input.readOnly ||
      event.altKey ||
      !(event.metaKey || event.ctrlKey)
    )
      return;
    const key = event.key.toLowerCase();
    if (key !== "z" && !(key === "y" && event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    compositionEnd();
    try {
      if (key === "y" || event.shiftKey) field.redo();
      else field.undo();
    } catch (error) {
      fail(error);
    }
  };
  input.addEventListener("keydown", historyKey);
  input.addEventListener("input", inputChanged);
  input.addEventListener("compositionstart", compositionStart);
  input.addEventListener("compositionend", compositionEnd);
  input.addEventListener("blur", compositionEnd);
  const stopInput = field.registerInput?.(compositionEnd);
  return {
    write,
    dispose() {
      if (closed) return;
      compositionEnd();
      closed = true;
      stopInput?.();
      stop();
      input.removeEventListener("keydown", historyKey);
      input.removeEventListener("input", inputChanged);
      input.removeEventListener("compositionstart", compositionStart);
      input.removeEventListener("compositionend", compositionEnd);
      input.removeEventListener("blur", compositionEnd);
    },
  };
}
