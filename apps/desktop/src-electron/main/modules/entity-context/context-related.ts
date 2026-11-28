/**
 * 脉络「相关」（KL-057）：语义相近、但还没有任何关系的卡片、文章、项目文档。纯本地近邻，不调模型。
 *
 * 1. 实体的节向量均值查前 NEIGHBOR_K 个近邻（与知识地图 neighborsOf 同一口径）；
 * 2. 排除已有关系：自身与共用正文、正文显式连接、引用了 / 被引用、谱系两端；
 * 3. 相似度高于当前库「随机对 p95」才算相关（阈值按嵌入指纹存 index_meta，换模型自动重算）；
 * 4. 最多 RELATED_LIMIT 条，带 AI 要点（有元信息时）。不计入元信息行的关联数（KL-015）。
 */

import type Database from "better-sqlite3";
import { normalizeEntityRefKind, entityRefKey, type EntityRef } from "@/entity/ref";
import type { ContextRelated } from "@/types/entity-context";
import ContentAiMetaTable from "../tables/content-ai-meta";
import ContentLinkTable from "../tables/content-link";
import EntitySearchTable from "../tables/entity-search";
import KnowledgeMapTable from "../tables/knowledge-map";
import { ensureRelatedThreshold, readThreshold, RELATED_TYPES } from "./related-threshold";

export const NEIGHBOR_K = 50;
export const RELATED_LIMIT = 5;
const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name);
const marks = (values: unknown[]) => values.map(() => "?").join(",");

/** 实体对应的正文（卡片 / 文章 / 项目文档各一份） */
function contentIdOf(db: Database.Database, ref: EntityRef): number | null {
  const sql =
    ref.kind === "card"
      ? `SELECT content_id FROM cards WHERE id = ?`
      : ref.kind === "article"
        ? `SELECT content_id FROM articles WHERE id = ? AND is_delete = 0`
        : ref.kind === "project-item"
          ? `SELECT content_id FROM project_item WHERE id = ?`
          : null;
  if (!sql) return null;
  const row = db.prepare(sql).get(ref.id) as { content_id: number | null } | undefined;
  return row?.content_id ?? null;
}

/** 已经有关系的实体与正文：这些不再作为「相关」推荐 */
export function relatedExclusions(
  mainDb: Database.Database,
  indexDb: Database.Database,
  identities: EntityRef[],
  contentIds: number[]
): { keys: Set<string>; contents: Set<number> } {
  const keys = new Set(identities.map(entityRefKey));
  const contents = new Set(contentIds);
  const addKey = (kind: unknown, id: unknown) => {
    const normalized = normalizeEntityRefKind(kind);
    const numeric = Number(id);
    if (normalized && Number.isSafeInteger(numeric)) keys.add(`${normalized}:${numeric}`);
  };

  // 正文显式连接（边无向：两侧都算已连接）
  if (contentIds.length) {
    const neighbors = ContentLinkTable.edgesOf(mainDb, contentIds);
    const neighborIds = [...new Set([...neighbors.values()].flat())];
    for (const ref of EntitySearchTable.locateAll(mainDb, neighborIds).values()) {
      for (const other of ref) addKey(other.kind, other.id);
    }
    for (const id of neighborIds) contents.add(id);
  }

  // 引用了 / 被引用（引用索引覆盖全部正文）
  if (hasTable(indexDb, "entity_refs") && contentIds.length) {
    const out = indexDb
      .prepare(
        `SELECT dst_kind, dst_id, dst_content_id FROM entity_refs WHERE src_content_id IN (${marks(contentIds)})`
      )
      .all(...contentIds) as Array<{
      dst_kind: string;
      dst_id: number;
      dst_content_id: number | null;
    }>;
    for (const row of out) {
      addKey(row.dst_kind, row.dst_id);
      if (row.dst_content_id != null) contents.add(row.dst_content_id);
    }
    const byRef = identities.map(() => "(dst_kind = ? AND dst_id = ?)").join(" OR ");
    const incoming = indexDb
      .prepare(
        `SELECT src_content_id FROM entity_refs
         WHERE dst_content_id IN (${marks(contentIds)}) OR ${byRef}`
      )
      .all(...contentIds, ...identities.flatMap(ref => [ref.kind, ref.id])) as Array<{
      src_content_id: number;
    }>;
    for (const row of incoming) contents.add(row.src_content_id);
  }

  // 谱系两端
  if (hasTable(mainDb, "entity_lineage")) {
    for (const ref of identities) {
      const kinds = ref.kind === "project-item" ? ["project-item", "project_item"] : [ref.kind];
      const rows = mainDb
        .prepare(
          `SELECT src_kind, src_id, dst_kind, dst_id FROM entity_lineage
           WHERE (src_kind IN (${marks(kinds)}) AND src_id = ?) OR (dst_kind IN (${marks(kinds)}) AND dst_id = ?)`
        )
        .all(...kinds, String(ref.id), ...kinds, String(ref.id)) as Array<{
        src_kind: string;
        src_id: string;
        dst_kind: string;
        dst_id: string;
      }>;
      for (const row of rows) {
        addKey(row.src_kind, row.src_id);
        addKey(row.dst_kind, row.dst_id);
      }
    }
  }

  return { keys, contents };
}

/** 实体不在范围内、没有向量或阈值不可用时为空 */
export function relatedOf(
  mainDb: Database.Database,
  indexDb: Database.Database,
  ref: EntityRef
): ContextRelated[] {
  if (!(RELATED_TYPES as readonly string[]).includes(ref.kind)) return [];
  // 查询时只核对嵌入指纹；向量规模的变化留给连库时的 ensureRelatedThreshold
  const stored = readThreshold(indexDb);
  const threshold =
    stored && stored.fingerprint === KnowledgeMapTable.readFingerprint(indexDb)
      ? stored
      : ensureRelatedThreshold(indexDb);
  if (!threshold) return [];
  const selfContent = contentIdOf(mainDb, ref);
  if (selfContent == null) return [];
  const identities = EntitySearchTable.locateAll(mainDb, [selfContent]).get(selfContent) ?? [ref];
  if (!identities.some(identity => entityRefKey(identity) === entityRefKey(ref))) {
    identities.push(ref);
  }
  const neighbors = KnowledgeMapTable.neighborsOf(indexDb, entityRefKey(ref), NEIGHBOR_K);
  if (!neighbors.length) return [];
  const exclusions = relatedExclusions(mainDb, indexDb, identities, [selfContent]);

  const picked: Array<{ ref: EntityRef; contentId: number; similarity: number }> = [];
  const seenContents = new Set<number>();
  for (const neighbor of neighbors) {
    if (picked.length >= RELATED_LIMIT) break;
    if (neighbor.similarity <= threshold.value) break;
    if (exclusions.keys.has(neighbor.key)) continue;
    const [kind, id] = neighbor.key.split(":");
    const target = { kind: normalizeEntityRefKind(kind), id: Number(id) };
    if (!target.kind || !Number.isSafeInteger(target.id)) continue;
    const contentId = contentIdOf(mainDb, target as EntityRef);
    if (contentId == null || exclusions.contents.has(contentId) || seenContents.has(contentId)) {
      continue;
    }
    seenContents.add(contentId);
    picked.push({ ref: target as EntityRef, contentId, similarity: neighbor.similarity });
  }
  const metas = ContentAiMetaTable.getMany(
    mainDb,
    picked.map(item => item.contentId)
  );
  const PICKER = { card: "card", article: "article", "project-item": "project_item" } as const;
  const related: ContextRelated[] = [];
  for (const item of picked) {
    const candidate = EntitySearchTable.resolve(
      mainDb,
      PICKER[item.ref.kind as keyof typeof PICKER],
      item.ref.id,
      0
    );
    if (!candidate) continue;
    related.push({
      entity: { ref: item.ref, title: candidate.title, meta: candidate.meta },
      summary: metas.get(item.contentId)?.meta.summary ?? "",
    });
  }
  return related;
}
