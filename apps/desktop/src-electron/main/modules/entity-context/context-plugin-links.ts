/**
 * 脉络「被关联」分区：哪些插件内容（context.links）关联了这个实体或共用正文的身份。
 * 来源取插件声明的类型外观显示；插件已卸载（孤儿）的来源不显示；建立关联时记下的目标创建时间
 * 与目标当前不一致（编号被新内容复用）时不算关联。不依赖插件运行，插件停用后照样显示。
 */

import type Database from "better-sqlite3";
import type { EntityRef, EntityRefKind } from "@/entity/ref";
import type { ContextEntity } from "@/types/entity-context";
import { NUMERIC_KINDS } from "../tables/plugin-ref-kinds";

/** 正文实体在插件引用里的类型 */
const PLUGIN_REF_KIND: Partial<Record<EntityRefKind, string>> = {
  card: "card",
  article: "article",
  "project-item": "document",
  "diary-moment": "diary",
  "plugin-entity": "plugin-entity",
};

export function pluginLinksOf(
  db: Database.Database,
  identities: EntityRef[],
  limit: number,
  toEntity: (ref: EntityRef) => ContextEntity | null
): ContextEntity[] {
  const inbound = db.prepare(
    `SELECT l.from_id, MAX(l.create_time) AS linked FROM plugin_links l
     JOIN plugin_entities e ON e.id = l.from_id AND e.orphaned_time IS NULL
     WHERE l.to_kind = ? AND l.to_id = ? AND l.to_created_at = ?
     GROUP BY l.from_id`
  );
  const sources = new Map<number, number>();
  for (const ref of identities) {
    const kind = PLUGIN_REF_KIND[ref.kind];
    if (!kind) continue;
    const created = db.prepare(NUMERIC_KINDS[kind].sql).get(ref.id) as
      { create_time: number } | undefined;
    if (!created) continue;
    for (const row of inbound.all(kind, String(ref.id), created.create_time) as Array<{
      from_id: number;
      linked: number;
    }>)
      sources.set(row.from_id, Math.max(sources.get(row.from_id) ?? 0, row.linked));
  }
  // 自己关联自己（插件内容之间）不显示
  for (const ref of identities) if (ref.kind === "plugin-entity") sources.delete(ref.id);
  const result: ContextEntity[] = [];
  for (const [id] of [...sources].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    if (result.length >= limit) break;
    const entity = toEntity({ kind: "plugin-entity", id });
    if (entity) result.push(entity);
  }
  return result;
}
