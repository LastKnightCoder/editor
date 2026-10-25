import YAML from "yaml";
import type { EditorTextField, TextFieldDelta, TextFieldSnapshot } from "@tau/editor/api";

function scalar(source: string, key: string) {
  const document = YAML.parseDocument(source);
  const value = document.get(key, true);
  if (
    document.errors.length ||
    !YAML.isMap(document.contents) ||
    !YAML.isScalar(value) ||
    typeof value.value !== "string" ||
    !value.range ||
    value.anchor ||
    value.tag
  ) {
    throw new Error("该元数据字段不能安全编辑，请保留当前输入后检查 YAML 源码");
  }
  return { value: value.value, start: value.range[0], end: value.range[1] };
}

function difference(before: string, after: string) {
  let offset = 0,
    suffix = 0;
  while (offset < before.length && offset < after.length && before[offset] === after[offset])
    offset++;
  while (
    suffix < before.length - offset &&
    suffix < after.length - offset &&
    before.at(-1 - suffix) === after.at(-1 - suffix)
  )
    suffix++;
  return {
    offset,
    remove: before.length - offset - suffix,
    text: after.slice(offset, after.length - suffix),
  };
}

/** 描述表单只修改对应 YAML 标量；其余键、注释和排版不重新序列化。 */
export function createYamlScalarField(source: EditorTextField, key: string): EditorTextField {
  let snapshot: TextFieldSnapshot = {
    value: scalar(source.getSnapshot().value, key).value,
    revision: source.getSnapshot().revision,
  };
  let closed = false;
  const listeners = new Set<Parameters<EditorTextField["subscribe"]>[0]>();
  const stop = source.subscribe(event => {
    const current = source.getSnapshot();
    let value = snapshot.value;
    try {
      value = scalar(current.value, key).value;
    } catch {
      /* 损坏源码保留最后可读值，后续提交明确失败。 */
    }
    const change = difference(snapshot.value, value);
    const delta: TextFieldDelta[] = [];
    if (change.offset) delta.push({ retain: change.offset });
    if (change.remove) delta.push({ delete: change.remove });
    if (change.text) delta.push({ insert: change.text });
    snapshot = { value, revision: current.revision };
    listeners.forEach(listener => listener({ delta, local: event.local }));
  });
  const editBatch: EditorTextField["editBatch"] = (changes, revision) => {
    const current = source.getSnapshot();
    if (closed || revision !== current.revision)
      throw new Error("元数据已变化，请保留当前输入后重试");
    const node = scalar(current.value, key);
    let next = node.value;
    for (const change of changes) {
      if (
        !Number.isSafeInteger(change.offset) ||
        !Number.isSafeInteger(change.remove) ||
        change.offset < 0 ||
        change.remove < 0 ||
        change.offset + change.remove > next.length ||
        typeof change.text !== "string"
      )
        throw new Error("元数据编辑位置无效");
      next = next.slice(0, change.offset) + change.text + next.slice(change.offset + change.remove);
    }
    if (next === node.value) return;
    const before = current.value.slice(node.start, node.end);
    const after = JSON.stringify(next) + (before.endsWith("\n") ? "\n" : "");
    const change = difference(before, after);
    source.edit({ ...change, offset: node.start + change.offset, revision });
  };
  return {
    registerInput: source.registerInput,
    flushInputs: source.flushInputs,
    preserveDraft: draft => {
      const current = source.getSnapshot();
      let value: string;
      try {
        const node = scalar(current.value, key),
          before = current.value.slice(node.start, node.end);
        value =
          current.value.slice(0, node.start) +
          JSON.stringify(draft.value) +
          (before.endsWith("\n") ? "\n" : "") +
          current.value.slice(node.end);
      } catch {
        value = current.value + `\n# 未提交的 ${key}: ${JSON.stringify(draft.value)}\n`;
      }
      source.preserveDraft?.({ value, revision: draft.revision });
    },
    getSnapshot: () => snapshot,
    subscribe: listener => {
      if (closed) throw new Error("元数据字段已关闭");
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    edit: change => editBatch([change], change.revision),
    editBatch,
    replace: (value, revision) =>
      editBatch([{ offset: 0, remove: snapshot.value.length, text: value }], revision),
    undo: () => {
      if (!closed) source.undo();
    },
    redo: () => {
      if (!closed) source.redo();
    },
    dispose: () => {
      if (closed) return;
      closed = true;
      stop();
      listeners.clear();
    },
  };
}
