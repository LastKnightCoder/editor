import type { EditorTextField, TextFieldSnapshot } from "@tau/editor/text-field-contract";
import type { BoardElement } from "../types/element";
import { v4 as uuid } from "uuid";

/** 草稿读取有独立租约；旧句柄永远不能转成正式文档的写入口。 */
export class CreationPreviewSession {
  readonly id = uuid();
  private listeners = new Set<() => void>();
  private closed = false;
  private cleanups = new Set<() => void>();
  private element?: BoardElement;

  constructor(element: BoardElement) {
    this.element = element;
  }

  get active() {
    return !this.closed;
  }

  getElement(id: string): BoardElement | undefined {
    if (!this.element) return;
    const find = (node: BoardElement): BoardElement | undefined => {
      if (node.id === id) return node;
      for (const child of node.children ?? []) {
        const found = find(child);
        if (found) return found;
      }
    };
    return find(this.element);
  }

  owns(element: BoardElement) {
    return this.getElement(element.id) === element;
  }

  subscribe = (listener: () => void) => {
    if (!this.closed) this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  onDispose(cleanup: () => void) {
    if (this.closed) cleanup();
    else this.cleanups.add(cleanup);
    return () => {
      this.cleanups.delete(cleanup);
    };
  }

  update(element: BoardElement) {
    if (this.closed) throw new Error("创建预览已失效");
    this.element = element;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("白板创建预览订阅失败", error);
      }
    }
  }

  textField(id: string, readValue: (element: BoardElement) => string): EditorTextField {
    const element = this.getElement(id);
    if (!element) throw new Error("创建预览已失效");
    let snapshot: TextFieldSnapshot = Object.freeze({
      value: readValue(element),
      revision: "preview:0",
    });
    let revision = 0;
    let disposed = false;
    const listeners = new Set<Parameters<EditorTextField["subscribe"]>[0]>();
    const unsubscribe = this.subscribe(() => {
      if (disposed) return;
      const next = this.getElement(id);
      if (!next) return;
      const value = readValue(next);
      if (value === snapshot.value) return;
      const previous = snapshot.value;
      snapshot = Object.freeze({ value, revision: `preview:${++revision}` });
      for (const listener of listeners)
        listener({
          delta: [{ delete: previous.length }, { insert: value }],
          local: false,
        });
    });
    const reject = () => {
      throw new Error("创建预览只读");
    };
    return {
      getSnapshot: () => snapshot,
      subscribe: listener => {
        if (!disposed && this.active) listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      edit: reject,
      editBatch: reject,
      replace: reject,
      undo: reject,
      redo: reject,
      dispose: () => {
        disposed = true;
        unsubscribe();
        listeners.clear();
      },
    };
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.element = undefined;
    this.listeners.clear();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
  }
}
