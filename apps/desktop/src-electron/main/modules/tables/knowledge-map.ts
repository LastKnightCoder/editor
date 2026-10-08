/**
 * 知识地图表：读取计算输入、读写离线结果。
 *
 * 节点是「我的思考」中成形的观点：卡片、未删文章、项目里非引用型且有正文的文档（07 §2.1）。
 * 共用一份正文的身份只出一个节点（卡片 > 文章 > 项目文档）。节点以 "kind:id" 为键。
 *
 * 计算本身（向量近邻 + 主题划分 + 布局）不在这里做——见 knowledge-map-builder，它在 worker 线程里跑，
 * 本表只负责 IO。读输入必须在主线程：better-sqlite3 连接不能跨线程共享。
 */

import type Database from "better-sqlite3";
import type {
  KnowledgeMap,
  KnowledgeMapItem,
  KnowledgeMapNode,
  KnowledgeMapNodeInput,
  KnowledgeMapTopic,
} from "@/knowledge-map/types";
import { ENTITY_REF_PRIORITY, normalizeEntityRefKind, type EntityRefKind } from "@/entity/ref";
import { contentTitles } from "./content-ai-meta";
import ContentLinkTable from "./content-link";

/** 地图基于哪个 embedding 指纹算的；指纹变了（换模型）就整体重算 */
export const KNOWLEDGE_MAP_FINGERPRINT_KEY = "knowledge_map_fingerprint";
export const KNOWLEDGE_MAP_COMPUTED_AT_KEY = "knowledge_map_computed_at";
const MAIN_CONTENT_FINGERPRINT_KEY = "main_content_embedding_fingerprint";

/** 参与地图的向量类型（vec_documents.type） */
const VECTOR_TYPES = ["card", "article", "project-item"] as const;
const VECTOR_TYPE_SQL = VECTOR_TYPES.map(type => `'${type}'`).join(",");

export interface KnowledgeMapInputs {
  nodes: KnowledgeMapNodeInput[];
  /** 节点数值 id → 分块向量（Float32 的原始字节，跨线程可转移） */
  chunks: Array<[number, ArrayBuffer[]]>;
}

/** 地图上的一个节点在主库里的样子 */
export interface MapEntity {
  key: string;
  kind: EntityRefKind;
  id: number;
  contentId: number;
  /** 命名用的标签路径 */
  tags: string[];
  /** max(实体, 正文) 的更新时间 */
  updateTime: number;
  createdAt: number;
  /** 文章、项目文档的标题；卡片没有标题列，展示时取 AI 标题或正文首行 */
  title: string;
  projectId: number | null;
}

const parseJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const stringTags = (raw: unknown) =>
  parseJson<unknown[]>(raw, []).filter((tag): tag is string => typeof tag === "string");

function hasTable(db: Database.Database, name: string) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name);
}

/** 项目文档的命名路径：项目名 / 所在文档树的顶层文档（自己就是顶层时取自己） */
function projectPaths(mainDb: Database.Database): Map<number, string> {
  const projects = new Map(
    (
      mainDb.prepare("SELECT id, title FROM project").all() as Array<{ id: number; title: string }>
    ).map(row => [row.id, row.title])
  );
  const items = new Map(
    (
      mainDb.prepare("SELECT id, title, parents, projects FROM project_item").all() as Array<{
        id: number;
        title: string;
        parents: string | null;
        projects: string | null;
      }>
    ).map(row => [
      row.id,
      {
        title: row.title,
        parent: Number(parseJson<unknown[]>(row.parents, [])[0]) || 0,
        project: Number(parseJson<unknown[]>(row.projects, [])[0]) || 0,
      },
    ])
  );
  const paths = new Map<number, string>();
  for (const [id, item] of items) {
    let top = item;
    const seen = new Set([id]);
    while (top.parent && items.has(top.parent) && !seen.has(top.parent)) {
      seen.add(top.parent);
      top = items.get(top.parent)!;
    }
    const project = projects.get(item.project);
    if (!project) continue;
    paths.set(id, top.title ? `${project}/${top.title}` : project);
  }
  return paths;
}

const NEIGHBOR_RECALL = 8;

/** 多条 float32 向量（vec0 原始字节）取 L2 归一化均值；维度不一致的丢弃 */
export function meanVector(blobs: Buffer[]): Buffer | null {
  const vectors = blobs.map(
    blob => new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
  );
  const dim = vectors[0]?.length ?? 0;
  if (!dim) return null;
  const sum = new Float64Array(dim);
  let count = 0;
  for (const vector of vectors) {
    if (vector.length !== dim) continue;
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) sum[i] += vector[i] / norm;
    count++;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += sum[i] * sum[i];
  norm = Math.sqrt(norm);
  if (!count || !norm) return null;
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = sum[i] / norm;
  return Buffer.from(out.buffer);
}

export default class KnowledgeMapTable {
  /** 当前应在地图上的全部节点，按键排序（计算结果依赖输入顺序，排序保证确定） */
  static listEntities(mainDb: Database.Database): MapEntity[] {
    const paths = projectPaths(mainDb);
    const rows = mainDb
      .prepare(
        `SELECT 'card' AS kind, c.id, c.content_id AS contentId, c.tags,
                MAX(c.update_time, COALESCE(ct.update_time, 0)) AS updateTime,
                c.create_time AS createdAt, '' AS title, NULL AS projects
         FROM cards c LEFT JOIN contents ct ON ct.id = c.content_id
         UNION ALL
         SELECT 'article', a.id, a.content_id, a.tags, MAX(a.update_time, COALESCE(ct.update_time, 0)),
                a.create_time, a.title, NULL
         FROM articles a LEFT JOIN contents ct ON ct.id = a.content_id WHERE a.is_delete = 0
         UNION ALL
         SELECT 'project-item', p.id, p.content_id, p.tags, MAX(p.update_time, COALESCE(ct.update_time, 0)),
                p.create_time, p.title, p.projects
         FROM project_item p JOIN contents ct ON ct.id = p.content_id
         WHERE p.project_item_type = 'document' AND ct.count > 0
           AND (p.ref_type IS NULL OR p.ref_type NOT IN ('card', 'article', 'content'))`
      )
      .all() as Array<{
      kind: EntityRefKind;
      id: number;
      contentId: number | null;
      tags: string | null;
      updateTime: number;
      createdAt: number;
      title: string | null;
      projects: string | null;
    }>;
    rows.sort((a, b) => ENTITY_REF_PRIORITY[a.kind] - ENTITY_REF_PRIORITY[b.kind] || a.id - b.id);
    const byContent = new Set<number>();
    const entities: MapEntity[] = [];
    for (const row of rows) {
      if (row.contentId) {
        if (byContent.has(row.contentId)) continue;
        byContent.add(row.contentId);
      }
      let tags = stringTags(row.tags);
      if (tags.length === 0 && row.kind === "project-item") {
        const path = paths.get(row.id);
        if (path) tags = [path];
      }
      entities.push({
        key: `${row.kind}:${row.id}`,
        kind: row.kind,
        id: row.id,
        contentId: row.contentId ?? 0,
        tags,
        updateTime: row.updateTime,
        createdAt: row.createdAt,
        title: row.title ?? "",
        projectId: Number(parseJson<unknown[]>(row.projects, [])[0]) || null,
      });
    }
    return entities.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  /** 显式边：正文显式连接 content_links（跨类型）+ 引用索引 entity_refs，按 entities 下标 */
  private static collectLinks(
    mainDb: Database.Database,
    indexDb: Database.Database,
    entities: MapEntity[]
  ): Set<number>[] {
    const indexOfKey = new Map(entities.map((entity, index) => [entity.key, index]));
    const indexOfContent = new Map(entities.map((entity, index) => [entity.contentId, index]));
    const links = entities.map(() => new Set<number>());
    // 正文显式连接（无向边，跨卡片/文章/项目文档/日记）
    for (const edge of ContentLinkTable.allEdges(mainDb)) {
      const from = indexOfContent.get(edge.contentId);
      const to = indexOfContent.get(edge.targetContentId);
      if (from === undefined || to === undefined || to === from) continue;
      links[from].add(to);
      links[to].add(from);
    }
    // 项目文档树：子文档连到最近的、在地图上的祖先（中间隔着空文档时跨过去）。
    // 这是用户亲手搭的结构，比语义近邻更可靠地说明「它们属于同一处」
    const parentOf = new Map(
      (
        mainDb.prepare("SELECT id, parents FROM project_item").all() as Array<{
          id: number;
          parents: string | null;
        }>
      ).map(row => [row.id, Number(parseJson<unknown[]>(row.parents, [])[0]) || 0])
    );
    for (const entity of entities) {
      if (entity.kind !== "project-item") continue;
      const from = indexOfKey.get(entity.key)!;
      const seen = new Set([entity.id]);
      let ancestor = parentOf.get(entity.id) ?? 0;
      while (ancestor && !seen.has(ancestor)) {
        const to = indexOfKey.get(`project-item:${ancestor}`);
        if (to !== undefined) {
          links[from].add(to);
          break;
        }
        seen.add(ancestor);
        ancestor = parentOf.get(ancestor) ?? 0;
      }
    }
    // 正文里的内联引用（迭代 1 的引用索引，覆盖全部类型）
    if (hasTable(indexDb, "entity_refs")) {
      for (const row of indexDb
        .prepare("SELECT src_content_id, dst_kind, dst_id, dst_content_id FROM entity_refs")
        .iterate() as Iterable<{
        src_content_id: number;
        dst_kind: string;
        dst_id: number;
        dst_content_id: number | null;
      }>) {
        const from = indexOfContent.get(row.src_content_id);
        if (from === undefined) continue;
        const kind = normalizeEntityRefKind(row.dst_kind);
        const to =
          (row.dst_content_id != null ? indexOfContent.get(row.dst_content_id) : undefined) ??
          (kind ? indexOfKey.get(`${kind}:${row.dst_id}`) : undefined);
        if (to !== undefined && to !== from) links[from].add(to);
      }
    }

    return links;
  }

  static readInputs(mainDb: Database.Database, indexDb: Database.Database): KnowledgeMapInputs {
    const entities = this.listEntities(mainDb);
    const indexOfKey = new Map(entities.map((entity, index) => [entity.key, index]));
    const links = this.collectLinks(mainDb, indexDb, entities);

    const nodes: KnowledgeMapNodeInput[] = entities.map((entity, index) => ({
      id: index,
      key: entity.key,
      tags: entity.tags,
      links: [...links[index]],
    }));

    const chunks = new Map<number, ArrayBuffer[]>();
    // 没配 embedding（或还没建过向量索引）时 vec_documents 不存在，地图退化为只靠显式链接
    if (hasTable(indexDb, "vec_documents")) {
      const statement = indexDb.prepare(
        `SELECT prefixed_id, vec_embedding FROM vec_documents WHERE type IN (${VECTOR_TYPE_SQL})`
      );
      for (const row of statement.iterate() as Iterable<{
        prefixed_id: string;
        vec_embedding: Buffer;
      }>) {
        const index = indexOfKey.get(row.prefixed_id);
        if (index === undefined) continue;
        // 拷出独立的 ArrayBuffer：better-sqlite3 返回的 Buffer 可能共享底层内存池
        const bytes = row.vec_embedding.buffer.slice(
          row.vec_embedding.byteOffset,
          row.vec_embedding.byteOffset + row.vec_embedding.byteLength
        ) as ArrayBuffer;
        const list = chunks.get(index);
        if (list) list.push(bytes);
        else chunks.set(index, [bytes]);
      }
    }
    return { nodes, chunks: [...chunks] };
  }

  /** 地图节点的展示信息（标题、创建时间、显式边），随地图一起返回给渲染层 */
  static listItems(mainDb: Database.Database, indexDb: Database.Database): KnowledgeMapItem[] {
    const entities = this.listEntities(mainDb);
    const links = this.collectLinks(mainDb, indexDb, entities);
    const cardTitles = contentTitles(
      mainDb,
      entities.filter(entity => entity.kind === "card").map(entity => entity.contentId),
      80
    );
    const projectTitles = new Map(
      (
        mainDb.prepare("SELECT id, title FROM project").all() as Array<{
          id: number;
          title: string;
        }>
      ).map(row => [row.id, row.title])
    );
    return entities.map((entity, index) => ({
      key: entity.key,
      kind: entity.kind as KnowledgeMapItem["kind"],
      id: entity.id,
      contentId: entity.contentId,
      title: entity.kind === "card" ? (cardTitles.get(entity.contentId) ?? "") : entity.title,
      createdAt: entity.createdAt,
      tags: entity.tags,
      links: [...links[index]].map(target => entities[target].key),
      projectId: entity.projectId,
      projectTitle: entity.projectId ? (projectTitles.get(entity.projectId) ?? null) : null,
    }));
  }

  static readFingerprint(indexDb: Database.Database): string {
    const row = indexDb
      .prepare("SELECT value FROM vec_index_meta WHERE key = ?")
      .get(MAIN_CONTENT_FINGERPRINT_KEY) as { value: string } | undefined;
    return row?.value ?? "";
  }

  private static getMeta(indexDb: Database.Database, key: string): string | null {
    const row = indexDb.prepare("SELECT value FROM index_meta WHERE key = ?").get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  private static setMeta(indexDb: Database.Database, key: string, value: string) {
    indexDb
      .prepare(
        `INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, Date.now());
  }

  static storedFingerprint(indexDb: Database.Database): string | null {
    return this.getMeta(indexDb, KNOWLEDGE_MAP_FINGERPRINT_KEY);
  }

  /** 整体替换：一个事务里清表再写，读的一方永远看不到半张地图 */
  static save(indexDb: Database.Database, map: KnowledgeMap, fingerprint: string) {
    const insertNode = indexDb.prepare(
      `INSERT INTO knowledge_map_nodes (node_key, x, y, topic, subtopic, update_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertTopic = indexDb.prepare(
      `INSERT INTO knowledge_map_topics (id, parent, label, color_slot, size) VALUES (?, ?, ?, ?, ?)`
    );
    indexDb.transaction(() => {
      indexDb.exec("DELETE FROM knowledge_map_nodes; DELETE FROM knowledge_map_topics;");
      for (const node of map.nodes) {
        insertNode.run(node.key, node.x, node.y, node.topic, node.subtopic, map.computedAt);
      }
      for (const topic of map.topics) {
        insertTopic.run(topic.id, topic.parent, topic.label, topic.colorSlot, topic.size);
      }
      this.setMeta(indexDb, KNOWLEDGE_MAP_FINGERPRINT_KEY, fingerprint);
      this.setMeta(indexDb, KNOWLEDGE_MAP_COMPUTED_AT_KEY, String(map.computedAt));
    })();
  }

  static load(indexDb: Database.Database): KnowledgeMap | null {
    if (!hasTable(indexDb, "knowledge_map_nodes")) return null;
    const computedAt = Number(this.getMeta(indexDb, KNOWLEDGE_MAP_COMPUTED_AT_KEY) ?? 0);
    if (!computedAt) return null;
    const nodes = indexDb
      .prepare("SELECT node_key AS key, x, y, topic, subtopic FROM knowledge_map_nodes")
      .all() as KnowledgeMapNode[];
    const topics = (
      indexDb
        .prepare("SELECT id, parent, label, color_slot, size FROM knowledge_map_topics ORDER BY id")
        .all() as Array<{
        id: number;
        parent: number;
        label: string;
        color_slot: number;
        size: number;
      }>
    ).map<KnowledgeMapTopic>(row => ({
      id: row.id,
      parent: row.parent,
      label: row.label,
      colorSlot: row.color_slot,
      size: row.size,
    }));
    return { nodes, topics, computedAt };
  }

  static hasVectors(indexDb: Database.Database, key: string): boolean {
    if (!hasTable(indexDb, "vec_documents")) return false;
    return !!indexDb.prepare("SELECT 1 FROM vec_documents WHERE prefixed_id = ? LIMIT 1").get(key);
  }

  /**
   * 自上次整体重算以来「变过」的节点数：增量放置的 ∪ 编辑过的（正文、tag、链接）。
   *
   * 编辑不做即时重新落位：改个错别字就让节点在地图上挪位置，用户看着会觉得地图在乱跳；
   * 而且编辑刚保存时向量多半还没重算，这时按旧向量落位等于没挪。编辑的效果（主题名、
   * 归属、位置）留给整体重算，这里只把它计入漂移，编辑够多了自然触发重算。
   * 两边按节点键去重：新建的节点既被放置过、更新时间也晚于重算时间，只算一次。
   */
  static driftCount(entities: MapEntity[], indexDb: Database.Database, computedAt: number): number {
    const changed = new Set(
      (
        indexDb
          .prepare("SELECT node_key FROM knowledge_map_nodes WHERE update_time > ?")
          .all(computedAt) as Array<{ node_key: string }>
      ).map(row => row.node_key)
    );
    for (const entity of entities) if (entity.updateTime > computedAt) changed.add(entity.key);
    return changed.size;
  }

  static upsertNode(indexDb: Database.Database, node: KnowledgeMapNode) {
    indexDb
      .prepare(
        `INSERT INTO knowledge_map_nodes (node_key, x, y, topic, subtopic, update_time)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(node_key) DO UPDATE SET x = excluded.x, y = excluded.y,
           topic = excluded.topic, subtopic = excluded.subtopic, update_time = excluded.update_time`
      )
      .run(node.key, node.x, node.y, node.topic, node.subtopic, Date.now());
  }

  static removeNode(indexDb: Database.Database, key: string) {
    indexDb.prepare("DELETE FROM knowledge_map_nodes WHERE node_key = ?").run(key);
  }

  /** 单个节点的语义近邻（增量放置用）：每个分块各查一次 KNN，按节点取最高相似度 */
  static neighborsOf(
    indexDb: Database.Database,
    key: string,
    k: number
  ): Array<{ key: string; similarity: number }> {
    if (!hasTable(indexDb, "vec_documents")) return [];
    const own = indexDb
      .prepare("SELECT vec_embedding FROM vec_documents WHERE prefixed_id = ?")
      .all(key) as Array<{ vec_embedding: Buffer }>;
    const query = meanVector(own.map(row => row.vec_embedding));
    if (!query) return [];
    // 长文按节有多条向量：取均值只查一次近邻（与地图按实体均值聚合同一口径），
    // 邻居同样有多节，多取几倍再按实体去重
    const best = new Map<string, number>();
    const rows = indexDb
      .prepare(
        `SELECT prefixed_id, distance FROM vec_documents
         WHERE vec_embedding MATCH ? AND k = ? AND type IN (${VECTOR_TYPE_SQL})`
      )
      .all(query, k * NEIGHBOR_RECALL) as Array<{ prefixed_id: string; distance: number }>;
    for (const row of rows) {
      if (row.prefixed_id === key) continue;
      const similarity = 1 - row.distance;
      if (similarity > (best.get(row.prefixed_id) ?? -Infinity)) {
        best.set(row.prefixed_id, similarity);
      }
    }
    return [...best.entries()]
      .map(([neighbor, similarity]) => ({ key: neighbor, similarity }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }
}
