import * as Y from "yjs";
import { YjsEditor, yTextToSlateElement, type YHistoryEditor } from "@slate-yjs/core";
import { Text, type Descendant, type Editor } from "slate";
import type { EditorDocument } from "@tau/editor";
import { createParagraph } from "@tau/editor/api/paragraph";
import { splitYjsUndoStep, withYjsDocument } from "./yjsBinding.ts";
import { reconcileYContent, type ReconcileOptions } from "./reconcile.ts";
import type { ReactNode } from "react";

export { replaceYText } from "./reconcile.ts";
export type LocalChangeSource = "user" | "external";
export interface LocalYjsDocumentOptions extends ReconcileOptions {
  /** 视图生命周期可独立于文档连接，例如隐藏源码模式下的富文本视图。 */
  wrap?: (children: ReactNode) => ReactNode;
}

/** 独立本地文档，不创建房间、Awareness、存储或产品数据迁移。 */
export function createLocalYjsDocument(
  initial: Descendant[] = [createParagraph()],
  options: LocalYjsDocumentOptions = {}
) {
  const doc = new Y.Doc();
  const root = doc.get("content", Y.XmlText);
  const sourceOrigin = {},
    externalOrigin = {};
  doc.transact(
    () => reconcileYContent(root, initial.length ? initial : [createParagraph()], options),
    externalOrigin
  );
  const undoManager = new Y.UndoManager(root, { trackedOrigins: new Set([sourceOrigin]) });
  const editors = new Set<Editor & YHistoryEditor>();
  const listeners = new Set<(source: LocalChangeSource) => void>();
  let disposed = false;
  const read = (): Descendant[] => {
    const normalizeText = (node: Descendant): Descendant =>
      Text.isText(node)
        ? { ...node, type: "formatted" }
        : ({ ...node, children: node.children.map(normalizeText) } as Descendant);
    const children = root.length ? yTextToSlateElement(root).children : [createParagraph()];
    return children.length ? children.map(normalizeText) : [createParagraph()];
  };
  const flush = () => {
    for (const editor of editors)
      if (YjsEditor.connected(editor)) YjsEditor.flushLocalChanges(editor);
  };
  const assertActive = () => {
    if (disposed) throw new Error("本地文档会话已释放");
  };
  const transact = (source: LocalChangeSource, run: () => void) => {
    assertActive();
    flush();
    if (source === "external") undoManager.stopCapturing();
    doc.transact(run, source === "external" ? externalOrigin : sourceOrigin);
    if (source === "external") undoManager.stopCapturing();
  };
  const document: EditorDocument = {
    lineage: `local-yjs:${doc.guid}`,
    history: "external",
    initialValue: [createParagraph()],
    binding: {
      install: editor => {
        assertActive();
        const origin = {};
        undoManager.trackedOrigins.add(origin);
        return withYjsDocument(editor, root, origin, undoManager);
      },
      connect: editor => {
        assertActive();
        const bound = editor as Editor & YHistoryEditor;
        editors.add(bound);
        if (!YjsEditor.connected(bound)) YjsEditor.connect(bound);
      },
      disconnect: editor => {
        const bound = editor as Editor & YHistoryEditor;
        if (YjsEditor.connected(bound)) YjsEditor.disconnect(bound);
        editors.delete(bound);
      },
      splitUndoStep: splitYjsUndoStep,
      wrap: options.wrap,
    },
  };
  const publish = (transaction: Y.Transaction) => {
    if (!transaction.changed.size) return;
    const source = transaction.origin === externalOrigin ? "external" : "user";
    for (const listener of listeners) listener(source);
  };
  doc.on("afterTransaction", publish);
  return {
    doc,
    root,
    document,
    undoManager,
    transact,
    flush,
    getContent: () => {
      assertActive();
      flush();
      return read();
    },
    updateContent: (content: Descendant[], source: LocalChangeSource = "user") =>
      transact(source, () =>
        reconcileYContent(root, content.length ? content : [createParagraph()], options)
      ),
    subscribe: (listener: (source: LocalChangeSource) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    undo: () => {
      assertActive();
      flush();
      undoManager.undo();
    },
    redo: () => {
      assertActive();
      flush();
      undoManager.redo();
    },
    dispose: () => {
      if (disposed) return;
      flush();
      for (const editor of [...editors]) document.binding?.disconnect(editor);
      listeners.clear();
      doc.off("afterTransaction", publish);
      undoManager.destroy();
      doc.destroy();
      disposed = true;
    },
  };
}
