import { Editor, Element, Node, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { ElementSpec } from "../api/extension";
import { canEditElement } from "../api/elementVersions";
import { submissionScopeSignal } from "./submissionScope";
import type {
  EditorTextField,
  EditorTextFields,
  TextFieldDelta,
  TextFieldSnapshot,
} from "../../../source-contracts";

/**
 * 以 Slate 节点属性承载源码的字段：编辑经 Slate 操作写入，撤销走编辑器自身的历史（Slate 历史或
 * 本地 Yjs 文档的 UndoManager）。无文档绑定的临时编辑器与本地 Yjs 文档使用；节点树等自有文本模型的
 * 文档提供自己的绑定。elements 也可传按类型查找声明的函数，节点声明随编辑器装配。
 */
export function createLocalTextFields(
  editor: Editor,
  elements: readonly ElementSpec[] | ((type: string) => ElementSpec | undefined)
): EditorTextFields {
  const definitionOf =
    typeof elements === "function"
      ? elements
      : (
          map => (type: string) =>
            map.get(type)
        )(new Map(elements.map(element => [element.type, element])));
  const observers = new Set<() => void>();
  const apply = editor.apply;
  let writing = false;
  editor.apply = operation => {
    apply(operation);
    if (operation.type === "set_selection") return;
    for (const observer of observers) {
      try {
        observer();
      } catch {
        console.error("源码字段订阅通知失败");
      }
    }
  };
  return {
    open(target, element, field) {
      if (
        target !== editor ||
        !definitionOf(element.type)?.collaboration?.textFields?.includes(field)
      )
        throw new Error("字段未声明文本编辑语义");
      let path: number[] | undefined;
      const identity = (element as unknown as { collabId?: string }).collabId;
      for (const [node, at] of Node.elements(editor)) {
        if (
          node === element ||
          (identity && (node as unknown as { collabId?: string }).collabId === identity)
        ) {
          path = at;
          break;
        }
      }
      if (!path) throw new Error("源码节点已失效");
      const reference = Editor.pathRef(editor, path);
      const listeners = new Set<Parameters<EditorTextField["subscribe"]>[0]>();
      const inputs = new Set<() => void>();
      const flushInputs = () => {
        for (const flush of inputs) flush();
      };
      let closed = false,
        sequence = 0;
      const prefix = crypto.randomUUID();
      const read = () => {
        const at = reference.current;
        const node = at && Node.has(editor, at) ? Node.get(editor, at) : undefined;
        if (!node || !Element.isElement(node)) return undefined;
        if (identity && (node as unknown as { collabId?: string }).collabId !== identity)
          return undefined;
        return node;
      };
      const value = () => {
        const node = read();
        const text = node && (node as unknown as Record<string, unknown>)[field];
        if (typeof text !== "string") throw new Error("源码字段不是字符串或已删除");
        return text;
      };
      let initialValue: string;
      try {
        initialValue = value();
      } catch (error) {
        reference.unref();
        throw error;
      }
      let snapshot: TextFieldSnapshot = Object.freeze({
        value: initialValue,
        revision: `${prefix}:0`,
      });
      let missing = false;
      const observe = () => {
        const node = read();
        if (!node) {
          if (missing) return;
          missing = true;
          sequence++;
          snapshot = Object.freeze({ ...snapshot, revision: `${prefix}:${sequence}` });
          listeners.forEach(listener => listener({ delta: [], local: writing }));
          return;
        }
        const next = value();
        if (!missing && snapshot.value === next) return;
        missing = false;
        let start = 0,
          suffix = 0;
        while (
          start < snapshot.value.length &&
          start < next.length &&
          snapshot.value[start] === next[start]
        )
          start++;
        while (
          suffix < snapshot.value.length - start &&
          suffix < next.length - start &&
          snapshot.value.at(-1 - suffix) === next.at(-1 - suffix)
        )
          suffix++;
        const delta: TextFieldDelta[] = [];
        if (start) delta.push({ retain: start });
        const removed = snapshot.value.length - start - suffix,
          inserted = next.slice(start, next.length - suffix);
        if (removed) delta.push({ delete: removed });
        if (inserted) delta.push({ insert: inserted });
        snapshot = Object.freeze({ value: next, revision: `${prefix}:${++sequence}` });
        listeners.forEach(listener => listener({ delta, local: writing }));
      };
      observers.add(observe);
      const check = (revision?: string) => {
        if (
          closed ||
          !read() ||
          submissionScopeSignal(editor)?.aborted ||
          ReactEditor.isReadOnly(editor)
        )
          throw new Error("当前源码字段不可写");
        const at = reference.current!;
        for (let length = 1; length <= at.length; length++) {
          const node = Node.get(editor, at.slice(0, length));
          if (Element.isElement(node) && !canEditElement(editor, node))
            throw new Error("当前节点只读");
        }
        if (
          revision !== undefined &&
          (snapshot.revision !== revision || value() !== snapshot.value)
        )
          throw new Error("源码已变化，请保留当前输入后重试");
      };
      const editBatch: EditorTextField["editBatch"] = (changes, revision) => {
        check(revision);
        let next = snapshot.value;
        for (const change of changes) {
          if (
            !Number.isSafeInteger(change.offset) ||
            !Number.isSafeInteger(change.remove) ||
            change.offset < 0 ||
            change.remove < 0 ||
            change.offset + change.remove > next.length ||
            typeof change.text !== "string"
          )
            throw new Error("源码编辑位置无效");
          next =
            next.slice(0, change.offset) + change.text + next.slice(change.offset + change.remove);
        }
        writing = true;
        try {
          Transforms.setNodes(editor, { [field]: next } as never, {
            at: reference.current!,
            voids: true,
          });
        } finally {
          writing = false;
        }
      };
      return {
        registerInput: flush => {
          inputs.add(flush);
          return () => {
            inputs.delete(flush);
          };
        },
        flushInputs,
        getSnapshot: () => snapshot,
        subscribe: listener => {
          if (closed) throw new Error("源码字段已释放");
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        edit: change => editBatch([change], change.revision),
        editBatch,
        replace: (next, revision) =>
          editBatch([{ offset: 0, remove: snapshot.value.length, text: next }], revision),
        undo: () => {
          check();
          (editor as Editor & { undo?(): void }).undo?.();
        },
        redo: () => {
          check();
          (editor as Editor & { redo?(): void }).redo?.();
        },
        dispose: () => {
          if (closed) return;
          flushInputs();
          closed = true;
          inputs.clear();
          reference.unref();
          observers.delete(observe);
          listeners.clear();
        },
      };
    },
  };
}
