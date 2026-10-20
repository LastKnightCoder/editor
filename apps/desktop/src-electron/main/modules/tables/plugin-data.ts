import Database from "better-sqlite3";
import { basename } from "node:path";
import { getMarkdown } from "@/utils/markdown.ts";
import type {
  PluginContentRecord,
  PluginDataEntity,
  PluginDataPage,
  PluginDataQuery,
  PluginDataRecord,
  PluginDataScope,
} from "@/types/plugin-data";
import { contentTitles } from "./content-ai-meta";
import EntitySearchTable from "./entity-search";

const MAX_LIMIT = 200;
const CARD_TITLE_LENGTH = 30;

/** 各实体统一投影成 id / created / updated / tags / pinned / title / 正文身份 */
const BASE_SQL: Record<PluginDataEntity, string> = {
  card: `SELECT c.id, c.create_time AS created,
      MAX(c.update_time, IFNULL(ct.update_time, 0)) AS updated,
      c.tags, c.is_top AS pinned, '' AS title, c.content_id AS content_id,
      ct.create_time AS content_created, IFNULL(ct.count, 0) AS word_count,
      NULL AS kind, NULL AS projects
    FROM cards c LEFT JOIN contents ct ON ct.id = c.content_id`,
  article: `SELECT a.id, a.create_time AS created,
      MAX(a.update_time, IFNULL(ct.update_time, 0)) AS updated,
      a.tags, a.is_top AS pinned, a.title, a.content_id AS content_id,
      ct.create_time AS content_created, IFNULL(ct.count, 0) AS word_count,
      NULL AS kind, NULL AS projects
    FROM articles a LEFT JOIN contents ct ON ct.id = a.content_id
    WHERE a.is_delete = 0`,
  // 引用型条目只是指向卡片 / 文章的入口，正文归被引用的实体
  document: `SELECT p.id, p.create_time AS created,
      MAX(p.update_time, IFNULL(ct.update_time, 0)) AS updated,
      p.tags, 0 AS pinned, p.title, p.content_id AS content_id,
      ct.create_time AS content_created, IFNULL(ct.count, 0) AS word_count,
      p.project_item_type AS kind, p.projects
    FROM project_item p LEFT JOIN contents ct ON ct.id = p.content_id
    WHERE p.ref_type IS NULL OR p.ref_type = ''`,
};

interface Row {
  id: number;
  created: number;
  updated: number;
  tags: string | null;
  pinned: number;
  title: string;
  content_id: number | null;
  content_created: number | null;
  word_count: number;
  kind: string | null;
  projects: string | null;
}

const ENTITIES = new Set<PluginDataEntity>(["card", "article", "document"]);

function parseList(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const optionalTime = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${name} 无效`);
  return value as number;
};

/** 插件业务数据只读查询；身份与库绑定由渲染端适配层负责，权限在渲染端宿主校验。 */
export default class PluginDataTable {
  static getListenEvents() {
    return {
      "plugin-data:query": this.query.bind(this),
      "plugin-data:get": this.get.bind(this),
      "plugin-data:content": this.content.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, scope: PluginDataScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  private static assertEntity(entity: unknown): asserts entity is PluginDataEntity {
    if (!ENTITIES.has(entity as PluginDataEntity)) throw new Error("未知的数据类型");
  }

  static query(
    db: Database.Database,
    request: PluginDataScope & { entity: PluginDataEntity; query: PluginDataQuery }
  ): PluginDataPage {
    this.assertDatabase(db, request);
    this.assertEntity(request.entity);
    const query = request.query;
    const limit = query.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT)
      throw new Error(`limit 必须是 1–${MAX_LIMIT} 的整数`);
    const sort = query.sort === "created" ? "created" : "updated";
    const where: string[] = [];
    const params: unknown[] = [];
    const range = (column: string, after: unknown, before: unknown, label: string) => {
      const from = optionalTime(after, `${label}起点`);
      const to = optionalTime(before, `${label}终点`);
      if (from !== undefined) {
        where.push(`${column} >= ?`);
        params.push(from);
      }
      if (to !== undefined) {
        where.push(`${column} < ?`);
        params.push(to);
      }
    };
    range("created", query.createdAfter, query.createdBefore, "创建时间");
    range("updated", query.updatedAfter, query.updatedBefore, "更新时间");
    if (query.tag !== undefined) {
      if (typeof query.tag !== "string" || !query.tag.trim()) throw new Error("标签无效");
      // 层级标签：筛「读书」同时命中「读书/小说」
      where.push(
        `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(tags) THEN tags ELSE '[]' END)
          WHERE value = ? OR substr(value, 1, length(?) + 1) = ? || '/')`
      );
      params.push(query.tag, query.tag, query.tag);
    }
    if (query.cursor !== undefined) {
      const match = /^(\d+):(\d+)$/.exec(String(query.cursor));
      if (!match) throw new Error("分页游标无效");
      where.push(`(${sort} < ? OR (${sort} = ? AND id < ?))`);
      params.push(Number(match[1]), Number(match[1]), Number(match[2]));
    }
    const rows = db
      .prepare(
        `SELECT * FROM (${BASE_SQL[request.entity]})
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY ${sort} DESC, id DESC LIMIT ?`
      )
      .all(...params, limit + 1) as Row[];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: this.records(db, request.entity, page),
      ...(rows.length > limit && last ? { cursor: `${last[sort]}:${last.id}` } : {}),
    };
  }

  static get(
    db: Database.Database,
    request: PluginDataScope & { entity: PluginDataEntity; id: number }
  ): PluginDataRecord | null {
    this.assertDatabase(db, request);
    this.assertEntity(request.entity);
    if (!Number.isSafeInteger(request.id) || request.id <= 0) return null;
    const row = db
      .prepare(`SELECT * FROM (${BASE_SQL[request.entity]}) WHERE id = ?`)
      .get(request.id) as Row | undefined;
    return row ? this.records(db, request.entity, [row])[0] : null;
  }

  static content(
    db: Database.Database,
    request: PluginDataScope & {
      contentId: number;
      createdAt: number;
      format: "markdown" | "nodes";
    }
  ): PluginContentRecord | null {
    this.assertDatabase(db, request);
    const row = db
      .prepare(
        "SELECT id, create_time, update_time, content, count FROM contents WHERE id = ? AND create_time = ?"
      )
      .get(request.contentId, request.createdAt) as
      | { id: number; create_time: number; update_time: number; content: string; count: number }
      | undefined;
    if (!row) return null;
    const nodes = parseList(row.content);
    const owners = new Set<PluginDataEntity>();
    for (const ref of EntitySearchTable.locateAll(db, [row.id]).get(row.id) ?? []) {
      if (ref.kind === "card" || ref.kind === "article") owners.add(ref.kind);
      else if (ref.kind === "project-item") owners.add("document");
    }
    return {
      contentId: row.id,
      createdAt: row.create_time,
      updatedAt: row.update_time,
      wordCount: row.count || 0,
      ...(request.format === "nodes"
        ? { nodes }
        : { markdown: getMarkdown(nodes as Parameters<typeof getMarkdown>[0]) }),
      owners: [...owners],
    };
  }

  private static records(
    db: Database.Database,
    entity: PluginDataEntity,
    rows: Row[]
  ): PluginDataRecord[] {
    const titles =
      entity === "card"
        ? contentTitles(
            db,
            rows.flatMap(row => (row.content_id ? [row.content_id] : [])),
            CARD_TITLE_LENGTH
          )
        : undefined;
    return rows.map(row => ({
      entity,
      id: row.id,
      title: titles ? (row.content_id ? (titles.get(row.content_id) ?? "") : "") : row.title,
      tags: parseList(row.tags).filter((tag): tag is string => typeof tag === "string"),
      pinned: Boolean(row.pinned),
      contentId: row.content_created === null ? null : row.content_id,
      contentCreatedAt: row.content_created,
      wordCount: row.word_count,
      createdAt: row.created,
      updatedAt: row.updated,
      ...(entity === "document"
        ? {
            kind: row.kind || "document",
            projectIds: parseList(row.projects).filter((id): id is number =>
              Number.isSafeInteger(id)
            ),
          }
        : {}),
    }));
  }
}
