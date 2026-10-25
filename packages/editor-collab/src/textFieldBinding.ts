import type * as Y from "yjs";
import type {
  EditorTextField,
  TextFieldDelta,
  TextFieldSnapshot,
} from "@tau/editor/source-contracts";
import type { NodeTree, NodeTreeHistory } from "@tau/collaboration";

export function createTextFieldBinding(
  tree: NodeTree,
  node: string,
  field: string,
  undo: NodeTreeHistory,
  canWrite: () => boolean,
  mutate?: (write: (target: NodeTree) => void, origin: object) => void,
  preserveDraft?: (snapshot: TextFieldSnapshot) => void
): EditorTextField {
  tree.attachUndoManager(undo);
  const text = tree.textField(node, field);
  return createSharedTextField(
    text,
    undo,
    () => canWrite() && !tree.isDeleted(node) && tree.textField(node, field) === text,
    (changes, origin) => {
      const write = (target: NodeTree) => {
        const fieldText = target.textField(node, field);
        target.doc.transact(() => {
          for (const change of changes) {
            if (change.remove) fieldText.delete(change.offset, change.remove);
            if (change.text) fieldText.insert(change.offset, change.text);
          }
        }, origin);
      };
      if (mutate) mutate(write, origin);
      else write(tree);
    },
    !mutate,
    preserveDraft
  );
}

/** 字符串输入与源码组件复用同一观察版本、增量事件和历史租约。 */
export function createSharedTextField(
  text: Y.Text,
  undo: NodeTreeHistory,
  canWrite: () => boolean,
  writeChanges: (
    changes: readonly { offset: number; remove: number; text: string }[],
    origin: object
  ) => void,
  allowReplace = true,
  preserveDraft?: (snapshot: TextFieldSnapshot) => void
): EditorTextField {
  const origin = {};
  const identity = crypto.randomUUID();
  let revision = 0;
  let disposed = false;
  let snapshot: TextFieldSnapshot = Object.freeze({
    value: text.toString(),
    revision: `${identity}:0`,
  });
  const listeners = new Set<
    (event: { delta: readonly TextFieldDelta[]; local: boolean }) => void
  >();
  const inputs = new Set<() => void>();
  const flushInputs = () => {
    for (const flush of inputs) flush();
  };
  const observe = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    snapshot = Object.freeze({ value: text.toString(), revision: `${identity}:${++revision}` });
    const delta = Object.freeze(
      structuredClone(event.delta).map(part => Object.freeze(part))
    ) as readonly TextFieldDelta[];
    for (const listener of listeners)
      listener({
        delta,
        local: transaction.origin === origin,
      });
  };
  text.observe(observe);
  const releaseOrigin = undo.retainOrigin(origin);
  const assertWritable = () => {
    undo.assertActive(text.doc!);
    if (disposed || !canWrite()) throw new Error("源码编辑已失效或当前只读");
  };
  const editBatch = (
    changes: readonly { offset: number; remove: number; text: string }[],
    expected: string
  ) => {
    assertWritable();
    if (expected !== snapshot.revision) throw new Error("SOURCE_CONFLICT: 源码已变化，请重新读取");
    let length = text.length;
    for (const change of changes) {
      if (
        !Number.isSafeInteger(change.offset) ||
        !Number.isSafeInteger(change.remove) ||
        change.offset < 0 ||
        change.remove < 0 ||
        change.offset + change.remove > length ||
        typeof change.text !== "string"
      )
        throw new Error("源码编辑范围无效");
      length += change.text.length - change.remove;
    }
    if (changes.length)
      writeChanges(
        changes.map(({ offset, remove, text }) => ({ offset, remove, text })),
        origin
      );
  };
  const edit = (change: { offset: number; remove: number; text: string; revision: string }) =>
    editBatch([change], change.revision);
  return {
    preserveDraft,
    registerInput: flush => {
      inputs.add(flush);
      return () => {
        inputs.delete(flush);
      };
    },
    flushInputs,
    getSnapshot: () => snapshot,
    subscribe: listener => {
      if (disposed) throw new Error("源码绑定已关闭");
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    edit,
    editBatch,
    replace: (value, expected) => {
      if (!allowReplace) throw new Error("共享整段替换须经宿主条件提交");
      edit({ offset: 0, remove: text.length, text: value, revision: expected });
    },
    undo: () => {
      assertWritable();
      undo.undo();
    },
    redo: () => {
      assertWritable();
      undo.redo();
    },
    dispose: () => {
      if (disposed) return;
      flushInputs();
      disposed = true;
      inputs.clear();
      text.unobserve(observe);
      listeners.clear();
      releaseOrigin();
    },
  };
}
