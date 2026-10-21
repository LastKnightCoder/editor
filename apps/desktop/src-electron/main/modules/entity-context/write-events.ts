/**
 * 会改变脉络内容、但不经过正文写入总线的 IPC 写事件：实体的增删与改标题、问题材料与插件关联的增删、
 * 谱系与「被使用」（白板、待办、Notebook 资源）两端的增删。高频写入（对话消息计数、闪卡复习、
 * Notebook 笔记流式生成）不在其中，那些端点的标题变化靠查询的 staleTime 与窗口聚焦刷新。
 * 命中时通知渲染端刷新脉络（引用本身的变化由引用索引器负责通知）。
 */

import { CONTENT_AI_META_CHANGED_EVENT } from "../tables/content-ai-meta";
import { EXCERPT_WRITE_EVENTS } from "../tables/excerpt";

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
  // 正文显式连接（连接是脉络「连接」分区的数据源）
  "content-links:add",
  "content-links:remove",
  // 插件内容与关联（「被关联」分区；恢复会插回实体与它的关联）
  "plugin-entities:create",
  "plugin-entities:update",
  "plugin-entities:delete",
  "plugin-links:add",
  "plugin-links:remove",
  "plugin-transaction:commit",
  "plugin-data:restore",
  // 问题与材料
  "question:link-targets",
  "question:unlink-target",
  "question:update",
  "question:update-status",
  "question:delete",
  "question:create-answer",
  "question:add-answer",
  "question:delete-answer",
  // 白板的增删与改名（画布内容的变化由白板引用索引负责通知）
  "create-white-board",
  "delete-white-board",
  "update-white-board-meta",
  "add-sub-white-board",
  "delete-sub-white-board",
  "rename-sub-white-board",
  // 谱系与它的端点
  "lineage:record",
  "chat-session:delete",
  "vl-note:create",
  "vl-note:delete",
  "flashcard:create-card",
  "flashcard:delete-card",
  "flashcard:delete-deck",
  // 外部材料（谱系 excerpt_of 的来源端：源端删除后卡片来源显示「原划线已删除」）
  ...EXCERPT_WRITE_EVENTS,
  "update-pdf-annotation",
  "delete-pdf-annotation",
  "delete-pdf",
  // AI 元信息（卡片标题与「相关」的要点），由 content-ai-queue 经 notifyExternalWrite 补发
  CONTENT_AI_META_CHANGED_EVENT,
  // 待办关联
  "todoNote:attachExisting",
  "todoNote:createAndAttach",
  "todoNote:detach",
  "todo:update-item",
  "todo:toggle-complete-cascade",
  "todo:archive-item",
  "todo:delete-item",
  "todo:delete-item-cascade",
  // Notebook 资源
  "vl-create-resource",
  "vl-ensure-note-resource",
  "vl-delete-resource",
  "vibe-learning-project:update",
  "vibe-learning-project:delete",
]);

/** 可能改变白板画布内容的写事件：命中后防抖对账白板引用索引 */
export const WHITEBOARD_CANVAS_EVENTS: ReadonlySet<string> = new Set([
  "white-board-content:create",
  "white-board-content:update",
  "white-board-content:delete",
  "white-board-content:increment-ref-count",
  "create-white-board",
  "delete-white-board",
  "update-white-board",
  "add-sub-white-board",
  "delete-sub-white-board",
  "update-sub-white-board",
  "duplicate-sub-white-board",
]);
