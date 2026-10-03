/**
 * 脉络「相关」（KL-057）：语义相近、但还没有任何关系的卡片、文章、项目文档。纯本地近邻，不调模型。
 *
 * 1. 实体的节向量均值查前 NEIGHBOR_K 个近邻（与知识地图 neighborsOf 同一口径）；
 * 2. 排除已有关系：自身与共用正文、卡片双向链接、引用了 / 被引用、谱系两端、同一问题的材料；
 * 3. 相似度高于当前库「随机对 p95」才算相关（阈值按嵌入指纹存 index_meta，换模型自动重算）；
 * 4. 最多 RELATED_LIMIT 条，带 AI 要点（有元信息时）。不计入元信息行的关联数（KL-015）。
 */

import type Database from "better-sqlite3";
import { normalizeEntityRefKind, entityRefKey, type EntityRef } from "@/entity/ref";
import type { ContextRelated } from "@/types/entity-context";
import ContentAiMetaTable from "../tables/content-ai-meta";
import EntitySearchTable from "../tables/entity-search";
import KnowledgeMapTable from "../tables/knowledge-map";

export const NEIGHBOR_K = 50;
export const RELATED_LIMIT = 5;
const THRESHOLD_META_KEY = "related_similarity_threshold";
const SAMPLE_PAIRS = 1000;
const THRESHOLD_PERCENTILE = 0.95;
/** 样本太少时阈值不可信，不给「相关」 */
const MIN_SAMPLE_PAIRS = 100;
/** 向量数比上次抽样时翻倍（或减半）就重新抽样 */
const RESAMPLE_RATIO = 2;
/** 参与「相关」的向量类型（与知识地图一致：我的思考） */
const RELATED_TYPES = ["card", "article", "project-item"] as const;
const TYPE_SQL = RELATED_TYPES.map(type => `'${type}'`).join(",");
const QUESTION_KIND: Record<string, EntityRef["kind"]> = {
  card: "card",
  article: "article",
  project_item: "project-item",
};

const marks = (values: unknown[]) => values.map(() => "?").join(",");

const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(name);

export interface RelatedThreshold {
  fingerprint: string;
  value: number;
  /** 抽样时的向量数 */
  vectors: number;
  pairs: number;
  sampledAt: number;
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const toFloats = (blob: Buffer) =>
  new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);

/** 确定性随机数：同一库多次抽样结果稳定，便于对照 */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 抽样随机对：随机取向量块两两配对（不同实体），取相似度的 p95 */
export function sampleRelatedThreshold(
  indexDb: Database.Database,
  fingerprint: string,
  now = Date.now()
): RelatedThreshold | null {
  if (!hasTable(indexDb, "vec_documents")) return null;
  const rows = indexDb
    .prepare(`SELECT rowid, prefixed_id FROM vec_documents WHERE type IN (${TYPE_SQL})`)
    .all() as Array<{ rowid: number; prefixed_id: string }>;
  const entities = new Set(rows.map(row => row.prefixed_id));
  if (entities.size < 2) return null;
  const random = rng(rows.length);
  const vectorOf = indexDb.prepare(`SELECT vec_embedding FROM vec_documents WHERE rowid = ?`);
  const similarities: number[] = [];
  for (
    let attempt = 0;
    attempt < SAMPLE_PAIRS * 3 && similarities.length < SAMPLE_PAIRS;
    attempt++
  ) {
    const a = rows[Math.floor(random() * rows.length)];
    const b = rows[Math.floor(random() * rows.length)];
    if (a.prefixed_id === b.prefixed_id) continue;
    const va = vectorOf.get(a.rowid) as { vec_embedding: Buffer } | undefined;
    const vb = vectorOf.get(b.rowid) as { vec_embedding: Buffer } | undefined;
    if (!va || !vb) continue;
    similarities.push(cosine(toFloats(va.vec_embedding), toFloats(vb.vec_embedding)));
  }
  if (similarities.length < MIN_SAMPLE_PAIRS) return null;
  similarities.sort((x, y) => x - y);
  const value =
    similarities[
      Math.min(similarities.length - 1, Math.floor(similarities.length * THRESHOLD_PERCENTILE))
    ];
  return { fingerprint, value, vectors: rows.length, pairs: similarities.length, sampledAt: now };
}

function readThreshold(indexDb: Database.Database): RelatedThreshold | null {
  const row = indexDb
    .prepare(`SELECT value FROM index_meta WHERE key = ?`)
    .get(THRESHOLD_META_KEY) as { value: string } | undefined;
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as RelatedThreshold;
  } catch {
    return null;
  }
}

function vectorCount(indexDb: Database.Database): number {
  if (!hasTable(indexDb, "vec_documents")) return 0;
  return (
    indexDb
      .prepare(`SELECT COUNT(*) AS n FROM vec_documents WHERE type IN (${TYPE_SQL})`)
      .get() as { n: number }
  ).n;
}

/**
 * 当前库的阈值：没有、嵌入指纹变了、或向量规模变化超过一倍时重新抽样并写回 index_meta。
 * 连库对账后调用一次；查询时缺失也会补算。
 */
export function ensureRelatedThreshold(indexDb: Database.Database): RelatedThreshold | null {
  if (!hasTable(indexDb, "vec_documents")) return null;
  const fingerprint = KnowledgeMapTable.readFingerprint(indexDb);
  const stored = readThreshold(indexDb);
  const count = vectorCount(indexDb);
  if (
    stored &&
    stored.fingerprint === fingerprint &&
    count <= stored.vectors * RESAMPLE_RATIO &&
    count * RESAMPLE_RATIO >= stored.vectors
  ) {
    return stored;
  }
  const next = sampleRelatedThreshold(indexDb, fingerprint);
  if (!next) return null;
  indexDb
    .prepare(
      `INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(THRESHOLD_META_KEY, JSON.stringify(next), next.sampledAt);
  return next;
}

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

const parseIds = (raw: string | null): number[] => {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
};

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

  // 卡片双向链接（两侧都查，单向残留也算已连接）
  for (const card of identities.filter(ref => ref.kind === "card")) {
    const row = mainDb.prepare(`SELECT links FROM cards WHERE id = ?`).get(card.id) as
      { links: string | null } | undefined;
    for (const id of parseIds(row?.links ?? null)) addKey("card", id);
    const reverse = mainDb
      .prepare(
        `SELECT c.id FROM cards c WHERE EXISTS (SELECT 1 FROM json_each(c.links) WHERE value = ?)`
      )
      .all(card.id) as Array<{ id: number }>;
    for (const { id } of reverse) addKey("card", id);
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

  // 同一问题的其他材料
  const targetClauses: string[] = [];
  const params: Array<string | number> = [];
  for (const ref of identities) {
    const type = Object.keys(QUESTION_KIND).find(key => QUESTION_KIND[key] === ref.kind);
    if (!type) continue;
    targetClauses.push(`(target_type = ? AND target_id = ?)`);
    params.push(type, ref.id);
  }
  if (contentIds.length) {
    targetClauses.push(`(target_type = 'answer' AND target_id IN (${marks(contentIds)}))`);
    params.push(...contentIds);
  }
  if (targetClauses.length) {
    const materials = mainDb
      .prepare(
        `SELECT target_type, target_id FROM question_link WHERE question_id IN (
           SELECT question_id FROM question_link WHERE ${targetClauses.join(" OR ")})`
      )
      .all(...params) as Array<{ target_type: string; target_id: number }>;
    for (const row of materials) {
      if (row.target_type === "answer") contents.add(row.target_id);
      else if (QUESTION_KIND[row.target_type])
        addKey(QUESTION_KIND[row.target_type], row.target_id);
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
