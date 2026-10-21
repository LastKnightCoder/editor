import type { Descendant, Editor } from "slate";
import type { RenderElementProps } from "slate-react";
import { YjsEditor } from "@slate-yjs/core";
import type { ContentNode } from "@tau/collaboration";
import type { EditorDocument, EditorDocumentBinding } from "@tau/editor";

import { CollaborationContext } from "./context";
import CollaborationCursors from "./Cursors";
import SafeCollaborationElement, { requiresSafeRendering } from "./SafeElement";
import type { EditorCollaborationBinding } from "./types";
import { rebindCollaboration, withCollaboration } from "./withCollaboration";
import { splitYjsUndoStep } from "./yjsBinding";

export interface YjsDocumentOptions {
  /**
   * 内容谱系；缺省取 Y.Doc 的 guid。**同一篇内容在本机与共享之间切换时必须传同一个值**，
   * 内核据此走换源而不是重建编辑器（01 §7.3）。
   */
  lineage?: string;
  /** 关闭协作光标的发送与展示，正文同步不受影响 */
  cursors?: boolean;
  /** 编辑器内容变化时回调（内容以 Y.Doc 为准，这里只用于通知，如同步工具条选区） */
  onChange?: (value: Descendant[], editor: Editor) => void;
}

/** 首帧占位：内容在 connect 时从 Y.Doc 读入 */
const EMPTY_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
];

/**
 * Yjs 文档源：内容与撤销都由 Y.Doc 负责（01 §7.2）。
 * 调用方要按 binding 缓存结果（`useMemo`），每次渲染新建会被内核视为换源。
 */
export function createYjsDocument(
  binding: EditorCollaborationBinding,
  options: YjsDocumentOptions = {}
): EditorDocument {
  const cursors = options.cursors ?? true;
  const editorBinding: EditorDocumentBinding = {
    install: editor => withCollaboration(editor, binding, { cursors }),
    connect: editor => {
      if (!YjsEditor.isYjsEditor(editor)) return;
      YjsEditor.connect(editor);
      binding.flushLocal = () => YjsEditor.flushLocalChanges(editor);
    },
    disconnect: editor => {
      if (!YjsEditor.isYjsEditor(editor)) return;
      YjsEditor.flushLocalChanges(editor);
      binding.flushLocal = undefined;
      YjsEditor.disconnect(editor);
    },
    rebind: editor => {
      if (!rebindCollaboration(editor, binding, { cursors })) return false;
      if (YjsEditor.isYjsEditor(editor))
        binding.flushLocal = () => YjsEditor.flushLocalChanges(editor);
      return true;
    },
    splitUndoStep: splitYjsUndoStep,
    renderElement: (props, renderByType) => renderPrivateBlock(binding, props, renderByType),
    renderOverlay: containerRef =>
      cursors ? <CollaborationCursors containerRef={containerRef} /> : null,
    wrap: children => (
      <CollaborationContext.Provider value={binding}>{children}</CollaborationContext.Provider>
    ),
  };
  return {
    lineage: options.lineage ?? `yjs:${binding.doc.guid}`,
    history: "external",
    initialValue: EMPTY_CONTENT,
    onChange: options.onChange,
    binding: editorBinding,
  };
}

/**
 * 共享模式下的私有块（白板、数据库等）：数据持有端（作者）复用原组件渲染真身，
 * 只读控制交给组件自身的 useReadOnly；远端没有私有数据，显示占位说明。
 */
function renderPrivateBlock(
  binding: EditorCollaborationBinding,
  props: RenderElementProps,
  renderByType: (props: RenderElementProps) => React.ReactElement | undefined
) {
  if (binding.mode === "local" || !requiresSafeRendering(props.element.type)) return undefined;
  const collabId = (props.element as unknown as ContentNode).collabId;
  const privateNode = typeof collabId === "string" ? binding.privateNodes.get(collabId) : undefined;
  if (privateNode?.type) {
    const rendered = renderByType({
      ...props,
      element: { ...privateNode, collabId } as unknown as RenderElementProps["element"],
    });
    if (rendered) return rendered;
  }
  return <SafeCollaborationElement {...props} />;
}
