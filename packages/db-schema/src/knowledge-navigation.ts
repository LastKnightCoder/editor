import type { KnowledgeMapping } from "./knowledge-references";

/** 旧 Tab 仅作为本地历史读取；无法定位的详情降级到项目列表。 */
export function migrateKnowledgeTab<T extends { type: unknown; params?: unknown; title?: string }>(
  tab: T,
  mapping: KnowledgeMapping | null
): T {
  if (tab.type !== "documentList" && tab.type !== "documentDetail") return tab;
  // 无迁移映射（新库或未经历知识库升级）时同样降级，避免旧 Tab 渲染成未知页面类型
  if (!mapping) {
    return { ...tab, type: "projectList", title: "项目", params: undefined };
  }
  const params = tab.params as { id?: number; itemId?: number } | undefined;
  const projectId = params?.id && mapping.projects[params.id];
  const itemId = params?.itemId && mapping.items[params.itemId];
  if (tab.type === "documentDetail" && projectId) {
    return {
      ...tab,
      type: "projectDetail",
      params: { id: projectId, ...(itemId ? { itemId } : {}) },
    };
  }
  return { ...tab, type: "projectList", title: "项目", params: undefined };
}
