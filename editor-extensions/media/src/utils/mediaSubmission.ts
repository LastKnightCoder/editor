import { Editor, Node, Path, type Element, type PathRef } from "slate";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { captureElementSubmission, getCommandElementPath } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import type { ImageElement, InlineImageElement, AudioElement, VideoElement } from "../types";

type MediaElement = ImageElement | InlineImageElement | AudioElement | VideoElement;
interface PendingMedia {
  path: PathRef;
}
const createPendingStore = () => createStore<readonly PendingMedia[]>(() => []);
const pendingByEditor = new WeakMap<Editor, ReturnType<typeof createPendingStore>>();
const pendingOf = (editor: Editor) => {
  let store = pendingByEditor.get(editor);
  if (!store) {
    store = createPendingStore();
    pendingByEditor.set(editor, store);
  }
  return store;
};

/** 忙态只属于当前实例，不写进持久化文档或协作数据。 */
export function useMediaUploading(editor: Editor, element: Element): boolean {
  return useStore(pendingOf(editor), entries =>
    entries.some(
      ({ path }) =>
        path.current && Node.has(editor, path.current) && Node.get(editor, path.current) === element
    )
  );
}

export const mediaResourceSnapshot = (element: MediaElement) =>
  JSON.stringify(
    element.type === "image"
      ? [element.url, element.previewUrl || element.url, element.cropTransform ?? null]
      : [element.type === "inline-image" ? element.url : element.src]
  );

/** 媒体领域保留资源冲突判断；同一目标的上传、换图和裁剪互斥。 */
export function beginMediaSubmission(
  editor: Editor,
  element: MediaElement,
  options: { path?: Path; signal?: AbortSignal } = {}
) {
  const path = getCommandElementPath(editor, { element, path: options.path });
  if (!path) return null;
  const pending = pendingOf(editor);
  if (pending.getState().some(entry => entry.path.current && Path.equals(entry.path.current, path)))
    return null;
  const service = editor.getService(IResourceService);
  const snapshot = mediaResourceSnapshot(element);
  const submission = captureElementSubmission(editor, {
    element,
    path,
    signal: options.signal,
    services: [IResourceService],
    accept: current => mediaResourceSnapshot(current) === snapshot,
  });
  if (submission.check()) {
    submission.dispose();
    return null;
  }
  const entry = { path: Editor.pathRef(editor, path) };
  const release = () => {
    entry.path.unref();
    pending.setState(
      pending.getState().filter(item => item !== entry),
      true
    );
  };
  submission.signal.addEventListener("abort", release, { once: true });
  pending.setState([...pending.getState(), entry], true);
  return { ...submission, upload: (file: File) => service.upload(file) };
}
