import { useMemo, useSyncExternalStore } from "react";
import type { Editor, Element } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { IEditorNodeViews } from "../../../source-contracts";
import { notifierOf } from "../services/editorNotifier";

type View = Readonly<Record<string, unknown>>;
interface Entry {
  getSnapshot(): View;
  subscribe(listener: () => void): () => void;
  update(patch: Record<string, unknown>): void;
}
const views = new WeakMap<Editor, Map<string, Entry>>();

/** 组件读取本机视图；持久化由当前文档服务负责，临时编辑器只保留会话内状态。 */
export function elementView(editor: Editor, element: Element): Entry {
  let entries = views.get(editor);
  if (!entries) {
    entries = new Map();
    views.set(editor, entries);
  }
  const nodeId = (element as unknown as { collabId?: string }).collabId;
  const id = nodeId ?? ReactEditor.findKey(editor, element).id;
  const service = editor.tryGetService(IEditorNodeViews);
  let entry = entries.get(id);
  if (!entry) {
    let value: View = nodeId ? (service?.read(nodeId) ?? {}) : {};
    const listeners = new Set<() => void>();
    let pending = Promise.resolve();
    entry = {
      getSnapshot: () => value,
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      update: patch => {
        const next = structuredClone(patch);
        if (!service || !nodeId) {
          value = { ...value, ...next };
          listeners.forEach(listener => listener());
          return;
        }
        pending = pending
          .then(async () => {
            value = await service.write(nodeId, next);
            listeners.forEach(listener => listener());
          })
          .catch(failure =>
            notifierOf(editor).error(
              failure instanceof Error ? failure.message : "本机视图尚未保存"
            )
          );
      },
    };
    entries.set(id, entry);
  }
  return entry;
}

export function useElementView(element: Element) {
  const editor = useSlateStatic();
  const id =
    (element as unknown as { collabId?: string }).collabId ??
    ReactEditor.findKey(editor, element).id;
  const entry = useMemo(() => elementView(editor, element), [editor, id]);
  const value = useSyncExternalStore(entry.subscribe, entry.getSnapshot, entry.getSnapshot);
  return { value, update: entry.update };
}
