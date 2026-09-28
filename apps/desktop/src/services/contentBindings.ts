import type { EditorCollaborationBinding } from "@tau/editor-collab";

/**
 * 打开中的内容会话绑定，按 contentId 登记。
 *
 * 给 React 之外的消费方用：白板离屏测高在编辑器组件外调用，共享模式下如果拿不到 binding，
 * 远端资源（`tau-collab-asset:` 引用）解析不出来、私有块占位与真实渲染不一致，高度就测不准。
 */
const bindings = new Map<number, EditorCollaborationBinding>();

export function registerContentBinding(contentId: number, binding: EditorCollaborationBinding) {
  bindings.set(contentId, binding);
  return () => {
    if (bindings.get(contentId) === binding) bindings.delete(contentId);
  };
}

export function getContentBinding(contentId?: number) {
  return typeof contentId === "number" ? bindings.get(contentId) : undefined;
}
