import type { ContentCollaborationBinding } from "@tau/editor-collab";

/**
 * 打开中的内容会话绑定，按 contentId 登记。
 *
 * 给 React 之外的消费方用：白板离屏测高在编辑器组件外调用，共享模式下如果拿不到 binding，
 * 远端资源（`tau-collab-asset:` 引用）解析不出来、私有块占位与真实渲染不一致，高度就测不准。
 */
const bindings = new Map<number, Map<ContentCollaborationBinding, boolean>>();
const listeners = new Set<() => void>();

export function subscribeContentBindings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerContentBinding(
  contentId: number,
  binding: ContentCollaborationBinding,
  writable = false
) {
  const views = bindings.get(contentId) ?? new Map<ContentCollaborationBinding, boolean>();
  views.set(binding, writable);
  bindings.set(contentId, views);
  for (const listener of listeners) listener();
  return () => {
    views.delete(binding);
    if (!views.size) bindings.delete(contentId);
    for (const listener of listeners) listener();
  };
}

export function getContentBinding(contentId?: number, documentId?: string) {
  const views = typeof contentId === "number" ? bindings.get(contentId) : undefined;
  if (!views) return;
  let latest: ContentCollaborationBinding | undefined;
  let editable: ContentCollaborationBinding | undefined;
  for (const [binding, writable] of views) {
    if (binding.doc.isDestroyed || (documentId && binding.doc.guid !== documentId)) continue;
    latest = binding;
    if (writable) editable = binding;
  }
  return documentId ? (editable ?? latest) : latest;
}
