import { vi } from "vitest";
import type {
  EditorTextField,
  TextFieldDelta,
  TextFieldSnapshot,
} from "@tau/editor/source-contracts";

export class Field implements EditorTextField {
  private snapshot: TextFieldSnapshot;
  private revision = 0;
  private listeners = new Set<
    (event: { delta: readonly TextFieldDelta[]; local: boolean }) => void
  >();
  writes = 0;
  writable = true;
  undo = vi.fn();
  redo = vi.fn();
  constructor(value: string) {
    this.snapshot = Object.freeze({ value, revision: "0" });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: (event: { delta: readonly TextFieldDelta[]; local: boolean }) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private change(offset: number, remove: number, text: string, local: boolean) {
    this.snapshot = Object.freeze({
      value:
        this.snapshot.value.slice(0, offset) + text + this.snapshot.value.slice(offset + remove),
      revision: String(++this.revision),
    });
    const delta: TextFieldDelta[] = [{ retain: offset }, { delete: remove }, { insert: text }];
    for (const listener of this.listeners) listener({ delta, local });
  }
  edit(change: { offset: number; remove: number; text: string; revision: string }) {
    this.editBatch([change], change.revision);
  }
  editBatch(
    changes: readonly { offset: number; remove: number; text: string }[],
    revision: string
  ) {
    if (!this.writable) throw new Error("当前只读");
    if (revision !== this.snapshot.revision) throw new Error("SOURCE_CONFLICT: 已变化");
    this.writes++;
    for (const change of changes) this.change(change.offset, change.remove, change.text, true);
  }
  replace(value: string, revision: string) {
    this.edit({ offset: 0, remove: this.snapshot.value.length, text: value, revision });
  }
  remote(offset: number, remove: number, text: string) {
    this.change(offset, remove, text, false);
  }
  dispose() {
    this.listeners.clear();
  }
}
