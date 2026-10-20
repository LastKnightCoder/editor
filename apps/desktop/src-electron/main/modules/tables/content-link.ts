/**
 * 正文显式连接（content_links）：无向边、一行一条、绑定 contents.id。
 * 共用同一份正文的身份共享同一组连接；add/remove 由 database.ts 通用包装层包在
 * 单事务里，无向边单行写入即天然原子双边（取代旧 cards.links 的两次补丁双边写）。
 */

import Database from "better-sqlite3";
import { basename } from "node:path";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import type { EntityKind } from "@/types/entity";
import type {
  ContentLinkEdge,
  ContentLinkTarget,
  ContentLinksOfContent,
} from "@/types/content-link";
import EntitySearchTable from "./entity-search";

const PICKER_KIND: Record<string, EntityKind> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  "diary-moment": "diary-moment",
  "plugin-entity": "plugin-entity",
};

interface EdgeRow {
  content_id: number;
  target_content_id: number;
  create_time: number;
}

function parseRef(raw: unknown): EntityRef {
  const input = raw as Partial<EntityRef> | null;
  const kind = normalizeEntityRefKind(input?.kind);
  const id = Number(input?.id);
  if (!kind || !Number.isSafeInteger(id) || id <= 0) throw new Error("实体地址无效");
  return { kind, id };
}

export default class ContentLinkTable {
  static getListenEvents() {
    return {
      "content-links:add": this.addLink.bind(this),
      "content-links:remove": this.removeLink.bind(this),
      "content-links:list-by-content-ids": this.listByContentIds.bind(this),
    } as const;
  }

  /** 实体对应的正文；日记精确到一条片段，实体不存在为空 */
  static contentIdsOfEntity(db: Database.Database, ref: EntityRef): number[] {
    const one = (sql: string) =>
      (db.prepare(sql).get(ref.id) as { content_id: number | null } | undefined)?.content_id;
    let ids: Array<number | null | undefined>;
    switch (ref.kind) {
      case "card":
        ids = [one(`SELECT content_id FROM cards WHERE id = ?`)];
        break;
      case "article":
        ids = [one(`SELECT content_id FROM articles WHERE id = ? AND is_delete = 0`)];
        break;
      case "project-item":
        ids = [one(`SELECT content_id FROM project_item WHERE id = ?`)];
        break;
      case "diary-moment":
        ids = [one(`SELECT content_id FROM diary_segments WHERE id = ?`)];
        break;
      case "plugin-entity":
        ids = [one(`SELECT content_id FROM plugin_entities WHERE id = ?`)];
        break;
    }
    return ids.filter((id): id is number => typeof id === "number" && id > 0);
  }

  /** 实体的正文是连接的落点 */
  static canonicalContentIdOf(db: Database.Database, ref: EntityRef): number | null {
    return this.contentIdsOfEntity(db, ref)[0] ?? null;
  }

  /** 一组正文的连接邻接表（边无向，两个方向都计入） */
  static edgesOf(db: Database.Database, contentIds: number[]): Map<number, number[]> {
    const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return new Map();
    const marks = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT content_id, target_content_id FROM content_links
         WHERE content_id IN (${marks}) OR target_content_id IN (${marks})
         ORDER BY create_time, rowid`
      )
      .all(...ids, ...ids) as Array<Pick<EdgeRow, "content_id" | "target_content_id">>;
    const map = new Map<number, number[]>(ids.map(id => [id, []]));
    for (const row of rows) {
      map.get(row.content_id)?.push(row.target_content_id);
      map.get(row.target_content_id)?.push(row.content_id);
    }
    return map;
  }

  /** 全部边（知识地图等离线计算用） */
  static allEdges(db: Database.Database): ContentLinkEdge[] {
    return (
      db
        .prepare(
          `SELECT content_id, target_content_id, create_time FROM content_links ORDER BY create_time`
        )
        .all() as EdgeRow[]
    ).map(row => ({
      contentId: row.content_id,
      targetContentId: row.target_content_id,
      createTime: row.create_time,
    }));
  }

  static addLink(
    db: Database.Database,
    rawFrom: unknown,
    rawTo: unknown,
    ctx: CommandContext = fallbackCommandContext
  ): boolean {
    const from = parseRef(rawFrom);
    const to = parseRef(rawTo);
    const fromContent = this.canonicalContentIdOf(db, from);
    const toContent = this.canonicalContentIdOf(db, to);
    if (fromContent == null) throw new Error("连接起点不存在或没有正文");
    if (toContent == null) throw new Error("连接目标不存在或没有正文");
    // 同一份正文（含共用正文的身份，如卡片与从它创建的项目文档）不互连
    if (fromContent === toContent) return false;
    const [low, high] =
      fromContent < toContent ? [fromContent, toContent] : [toContent, fromContent];
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO content_links (content_id, target_content_id, create_time)
         VALUES (?, ?, ?)`
      )
      .run(low, high, Date.now()).changes;
    if (inserted > 0) {
      ctx.broadcastAll("content-links:changed", { databaseName: basename(db.name) });
    }
    return inserted > 0;
  }

  static removeLink(
    db: Database.Database,
    rawFrom: unknown,
    rawTo: unknown,
    ctx: CommandContext = fallbackCommandContext
  ): boolean {
    const from = parseRef(rawFrom);
    const to = parseRef(rawTo);
    const fromContent = this.canonicalContentIdOf(db, from);
    const toContent = this.canonicalContentIdOf(db, to);
    if (fromContent == null || toContent == null || fromContent === toContent) return false;
    const [low, high] =
      fromContent < toContent ? [fromContent, toContent] : [toContent, fromContent];
    const removed = db
      .prepare(`DELETE FROM content_links WHERE content_id = ? AND target_content_id = ?`)
      .run(low, high).changes;
    if (removed > 0) {
      ctx.broadcastAll("content-links:changed", { databaseName: basename(db.name) });
    }
    return removed > 0;
  }

  /** 批量取一组正文各自的连接目标（代表身份 + 标题，供列表徽标与表格列） */
  static listByContentIds(db: Database.Database, contentIds: number[]): ContentLinksOfContent[] {
    const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return [];
    // IN 参数上限（SQLITE_MAX_VARIABLE_NUMBER），超大批量分片查询（同 locateAll 的分批思路）；
    // 同一条边两端落在不同批次时会重复命中，由下方 seen 集合去重
    const BATCH = 500;
    const edgeRows: EdgeRow[] = [];
    const selectEdges = db.prepare(
      `SELECT content_id, target_content_id, create_time FROM content_links
       WHERE content_id IN (${Array.from({ length: Math.min(BATCH, ids.length) }, () => "?").join(",")})
          OR target_content_id IN (${Array.from({ length: Math.min(BATCH, ids.length) }, () => "?").join(",")})
       ORDER BY create_time`
    );
    for (let start = 0; start < ids.length; start += BATCH) {
      const batch = ids.slice(start, start + BATCH);
      edgeRows.push(...(selectEdges.all(...batch, ...batch) as EdgeRow[]));
    }
    // 分批只保证批内有序，这里恢复整体按建立时间排序
    edgeRows.sort((a, b) => a.create_time - b.create_time || a.content_id - b.content_id);

    const targetContents = [
      ...new Set(edgeRows.flatMap(row => [row.content_id, row.target_content_id])),
    ];
    const located = EntitySearchTable.locateAll(db, targetContents);
    // 缓存只存身份与标题（contentId 是每条边的落点，不能随身份缓存）
    const resolved = new Map<string, { ref: EntityRef; title: string }>();
    const resolveTarget = (contentId: number): ContentLinkTarget | null => {
      const ref = located.get(contentId)?.[0];
      if (!ref) return null;
      const key = `${ref.kind}:${ref.id}`;
      const cached = resolved.get(key);
      if (cached) return { ...cached, contentId };
      const candidate = EntitySearchTable.resolve(db, PICKER_KIND[ref.kind], ref.id, 0);
      if (!candidate) return null;
      resolved.set(key, { ref, title: candidate.title });
      return { ref, title: candidate.title, contentId };
    };

    const neighbors = new Map<number, ContentLinkTarget[]>(ids.map(id => [id, []]));
    const seen = new Map<number, Set<number>>(ids.map(id => [id, new Set()]));
    for (const row of edgeRows) {
      for (const [owner, target] of [
        [row.content_id, row.target_content_id],
        [row.target_content_id, row.content_id],
      ] as const) {
        if (!neighbors.has(owner) || owner === target) continue;
        if (seen.get(owner)!.has(target)) continue;
        const entity = resolveTarget(target);
        if (!entity) continue;
        seen.get(owner)!.add(target);
        neighbors.get(owner)!.push(entity);
      }
    }
    return ids.map(contentId => ({ contentId, targets: neighbors.get(contentId) ?? [] }));
  }

  /** 正文删除（引用计数归零）时释放两侧的边；由 ContentTable.releaseContent 调用 */
  static releaseContent(db: Database.Database, contentId: number): void {
    db.prepare(`DELETE FROM content_links WHERE content_id = ? OR target_content_id = ?`).run(
      contentId,
      contentId
    );
  }

  /**
   * cards.links → content_links 一次性迁移（maintenance 模式开库执行）。
   * 幂等护栏：所有卡片的 links 清空后不再命中；迁移与清空同一事务。
   */
  static migrateCardsLinks(db: Database.Database): void {
    const pending = db
      .prepare(
        `SELECT 1 FROM cards
         WHERE links IS NOT NULL AND links NOT IN ('[]', '', 'null') LIMIT 1`
      )
      .get();
    if (!pending) return;
    db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO content_links (content_id, target_content_id, create_time)
         SELECT MIN(c.content_id, t.content_id), MAX(c.content_id, t.content_id), ?
         FROM cards c, json_each(CASE WHEN json_valid(c.links) THEN c.links ELSE '[]' END) je
         JOIN cards t ON t.id = CAST(je.value AS INTEGER) AND t.content_id IS NOT NULL
         WHERE c.content_id IS NOT NULL AND c.content_id != t.content_id`
      ).run(Date.now());
      db.prepare(`UPDATE cards SET links = '[]'`).run();
    })();
  }
}
