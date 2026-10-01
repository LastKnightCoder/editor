/**
 * 会改变脉络内容、但不经过正文写入总线的 IPC 写事件：实体的增删与改标题、问题材料的关联与解除。
 * 命中时通知渲染端刷新脉络（引用本身的变化由引用索引器负责通知）。
 */

export const CONTEXT_WRITE_EVENTS: ReadonlySet<string> = new Set([
  // 卡片
  "cards:create-scoped",
  "cards:remove-scoped",
  "create-card",
  "create-card-from-project-item",
  "delete-card",
  "build-card-from-content",
  // 文章（含改标题、软删）
  "create-article",
  "create-article-from-project-item",
  "update-article",
  "delete-article",
  "build-article-from-content",
  // 项目文档（含改标题、增删）
  "update-project-item",
  "delete-project-item",
  "delete-project",
  "add-root-project-item",
  "add-child-project-item",
  "add-ref-root-project-item",
  "add-ref-child-project-item",
  "remove-root-project-item",
  "remove-child-project-item",
  "delete-project-items-not-in-any-project",
  // 日记
  "delete-diary-entry",
  "delete-diary-segment",
  // 问题与材料
  "question:link-targets",
  "question:unlink-target",
  "question:update",
  "question:update-status",
  "question:delete",
  "question:create-answer",
  "question:add-answer",
  "question:delete-answer",
]);
