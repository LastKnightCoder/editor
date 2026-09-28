import { useEffect, useRef } from "react";
import type { ContentSessionTarget, SharedContent } from "@tau/collaboration";
import { createYjsDocument, type EditorCollaborationBinding } from "@tau/editor-collab";
import type { EditorDocument } from "@tau/editor/src";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import useContentSession from "@/hooks/useContentSession";
import { registerContentBinding } from "@/services/contentBindings";

export interface ContentDocument {
  /** 传给 `<Editor document>`；换源期间沿用上一份，编辑器不重建（01 §7.3 第 2、3 层） */
  document?: EditorDocument;
  binding?: EditorCollaborationBinding;
  article?: SharedContent;
  error?: string;
  /** 会话被冻结（主进程正在切换共享状态） */
  frozen: boolean;
  /** 正在换源：底层会话换了身份（发起 / 结束共享），新订阅还没就绪 */
  swapping: boolean;
}

/**
 * 一篇内容的文档源句柄（01 §7.4）。内部处理内容会话、共享升级与降级：
 * 发起或结束共享时主进程只是给同一个 Y.Doc 换身份，这里换出一个新的文档源，
 * 谱系（lineage）不变，编辑器因此走换源而不是重建。
 */
export default function useContentDocument(
  contentId?: number,
  source?: Omit<ContentSessionTarget, "contentId">
): ContentDocument & { sessionError?: string } {
  const { entry, error: sessionError, databaseName } = useContentSession(contentId, source);
  const documentId = entry?.documentId;
  const { binding, article, error, frozen } = useCollaborationDocument(documentId);
  const lineage = contentId ? `content:${databaseName}:${contentId}` : undefined;
  // 文档源按 binding 缓存：每次渲染新建会被内核视为换了文档
  const current = useRef<{ binding: EditorCollaborationBinding; document: EditorDocument }>(null);
  if (binding && current.current?.binding !== binding)
    current.current = { binding, document: createYjsDocument(binding, { lineage }) };
  // 登记给 React 之外的消费方（白板离屏测高要用同一个绑定解析远端资源）
  useEffect(() => {
    if (!contentId || !binding) return;
    return registerContentBinding(contentId, binding);
  }, [contentId, binding]);
  return {
    document: current.current?.document,
    binding: binding ?? current.current?.binding,
    article,
    error,
    sessionError,
    frozen,
    // 旧订阅已注销、新订阅未就绪：正文继续显示，但这段时间不接受编辑，
    // 否则改动会落在已销毁的会话上
    swapping: Boolean(documentId) && !binding && Boolean(current.current),
  };
}
