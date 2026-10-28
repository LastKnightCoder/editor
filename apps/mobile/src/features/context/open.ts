// 脉络条目的跳转映射：按目标类型推入对应详情页；移动端没有承载页面的类型（问题、
// 闪卡、对话、Notebook、摘录、日记片段等）只读展示，不提供跳转。

import type { ContextEntity, ContextLineageItem, ContextUsage } from "./types";
import { openMobilePluginEntity } from "../../services/pluginEntities";
import { toast } from "../../components/toast";

type NavigatorLike = {
  push: (key: string, params: Record<string, unknown>) => void;
};

const OPENABLE_ENTITY_KINDS = new Set(["card", "article", "project-item", "plugin-entity"]);

/** 插件实体由所属插件注册的页面承载，实际打开时复验启用状态。 */
export const canOpenContextEntity = (entity: ContextEntity) =>
  OPENABLE_ENTITY_KINDS.has(entity.kind);

/** 实体条目（连接 / 被引用 / 投影）能否跳转、跳到哪里 */
export function openContextEntity(navigator: NavigatorLike, entity: ContextEntity): boolean {
  switch (entity.kind) {
    case "plugin-entity":
      void openMobilePluginEntity(entity.id, {
        expectedContentId: entity.contentId ?? undefined,
        expectedCreatedAt: entity.pluginEntity?.createdAt,
      }).catch(error =>
        toast({ type: "warning", text: String(error instanceof Error ? error.message : error) })
      );
      return true;
    case "card":
      navigator.push("contentDetail", { cardId: entity.id });
      return true;
    case "article":
      navigator.push("articleEditor", { articleId: entity.id });
      return true;
    case "project-item":
      navigator.push("projectDocEditor", { itemId: entity.id, projectTitle: entity.meta ?? "" });
      return true;
    default:
      return false;
  }
}

/** 谱系 / 被使用条目能否跳转、跳到哪里；usage 的 key 形如 "todo:3"，谱系 nodeId 为数字文本 */
export function openContextNode(
  navigator: NavigatorLike,
  item: ContextLineageItem | ContextUsage
): boolean {
  const numericId = Number.parseInt(
    "nodeId" in item ? item.nodeId : (item.key.split(":")[1] ?? ""),
    10
  );
  if (!Number.isFinite(numericId)) return false;
  const kind = "nodeId" in item ? item.kind : item.kind === "todo" ? "todo" : "";
  switch (kind) {
    case "plugin-entity":
      void openMobilePluginEntity(numericId).catch(error =>
        toast({ type: "warning", text: String(error instanceof Error ? error.message : error) })
      );
      return true;
    case "card":
      navigator.push("contentDetail", { cardId: numericId });
      return true;
    case "article":
      navigator.push("articleEditor", { articleId: numericId });
      return true;
    case "project-item":
      navigator.push("projectDocEditor", { itemId: numericId, projectTitle: "" });
      return true;
    case "todo":
      navigator.push("todoDetail", { todoId: numericId });
      return true;
    default:
      return false;
  }
}
