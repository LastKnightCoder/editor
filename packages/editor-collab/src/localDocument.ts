import * as Y from "yjs";
import { YjsEditor, type YHistoryEditor } from "@slate-yjs/core";
import { type Descendant, type Editor } from "slate";
import type { EditorDocument } from "@tau/editor";
import { createParagraph } from "@tau/editor/api/paragraph";
import { splitYjsUndoStep, withYjsDocument } from "./yjsBinding.ts";
import { reconcileYContent, type ReconcileOptions } from "./reconcile.ts";
import type { ReactNode } from "react";
import { createContentProjection, readYjsContent } from "./contentProjection.ts";

export { replaceYText } from "./reconcile.ts";
export type LocalChangeSource = "user" | "external";
export interface LocalYjsDocumentOptions extends ReconcileOptions {
  /** 视图生命周期可独立于文档连接，例如隐藏源码模式下的富文本视图。 */
  wrap?: (children: ReactNode) => ReactNode;
  /** Yjs 不保存空文本；连接时可按当前 schema 补齐落点，随后仍执行完整规范化。 */
  prepareInitialContent?: (content: Descendant[], editor: Editor) => Descendant[];
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
  const projection = createContentProjection(root);
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
        if (!YjsEditor.connected(bound)) {
          const prepareInitialContent = options.prepareInitialContent;
          if (!prepareInitialContent) {
            YjsEditor.connect(bound);
          } else {
            const normalize = bound.normalize;
            bound.normalize = normalizeOptions => {
              if (normalizeOptions?.force) {
                bound.children = prepareInitialContent(bound.children, bound);
              }
              normalize.call(bound, normalizeOptions);
            };
            try {
              YjsEditor.connect(bound);
            } finally {
              bound.normalize = normalize;
            }
          }
        }
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
      return structuredClone(readYjsContent(root));
    },
    /** 独立只读快照：JSON 块深冻结并复用，二进制等扩展值每次复制，不得原地修改。 */
    getSnapshot: () => {
      assertActive();
      flush();
      return projection.read();
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
      projection.dispose();
      undoManager.destroy();
      doc.destroy();
      disposed = true;
    },
  };
}
