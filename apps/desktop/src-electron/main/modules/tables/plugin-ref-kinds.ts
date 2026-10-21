/**
 * 以数字 ID 寻址的插件引用类型：所在表的创建时间查询与标题解析用的检索类型。
 * 只依赖类型，供引用定位（plugin-refs）与脉络（entity-context）共用。
 */
import type { EntityKind } from "@/types";

/** 以数字 ID 寻址的插件引用类型：所在表、附加条件与标题解析用的检索类型 */
export const NUMERIC_KINDS: Record<string, { sql: string; search: EntityKind }> = {
  card: { sql: "SELECT create_time FROM cards WHERE id = ?", search: "card" },
  article: {
    sql: "SELECT create_time FROM articles WHERE id = ? AND is_delete = 0",
    search: "article",
  },
  document: { sql: "SELECT create_time FROM project_item WHERE id = ?", search: "project_item" },
  diary: { sql: "SELECT create_time FROM diary_segments WHERE id = ?", search: "diary-moment" },
  whiteboard: { sql: "SELECT create_time FROM white_boards WHERE id = ?", search: "white_board" },
  project: { sql: "SELECT create_time FROM project WHERE id = ?", search: "project" },
  notebook: {
    sql: "SELECT create_time FROM vibe_learning_project WHERE id = ?",
    search: "notebook",
  },
  "plugin-entity": {
    sql: "SELECT create_time FROM plugin_entities WHERE id = ?",
    search: "plugin-entity",
  },
};
