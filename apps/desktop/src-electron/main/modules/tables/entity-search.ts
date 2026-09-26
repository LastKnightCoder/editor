/**
 * 通用实体检索（renderer EntityPicker 的后端）：按类型 LIKE 检索标题 / 正文，空关键字按最近更新。
 * 只读、无自有表；问题材料选择、待办关联笔记等「关联已有」场景共用。
 */

import Database from "better-sqlite3";
import type { EntityCandidate, EntityKind, EntityLocation, EntitySearchParams } from "@/types";
import ContentTable from "./content";
import DiaryTable from "./diary";

/** Slate 文档按块取纯文本：第一块即卡片标题 */
export const blockLines = (nodes: unknown): string[] => {
  const text = (node: any): string => {
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    if (typeof node.code === "string") return node.code;
    return Array.isArray(node.children) ? node.children.map(text).join("") : "";
  };
  return Array.isArray(nodes) ? nodes.map(node => text(node).trim()).filter(Boolean) : [];
};

const parseJsonArray = (raw: unknown): unknown[] => {
  if (typeof raw !== "string") return Array.isArray(raw) ? raw : [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const EXCERPT = 160;

const SEARCH_SQL: Record<EntityKind, (kw: boolean) => string> = {
  card: kw => `SELECT c.id, c.update_time AS t FROM cards c LEFT JOIN contents ct ON ct.id = c.content_id
    ${kw ? "WHERE ct.content LIKE @kw" : ""} ORDER BY c.update_time DESC LIMIT @limit`,
  article:
    kw => `SELECT a.id, a.update_time AS t FROM articles a LEFT JOIN contents ct ON ct.id = a.content_id
    WHERE a.is_delete = 0 ${kw ? "AND (a.title LIKE @kw OR ct.content LIKE @kw)" : ""}
    ORDER BY a.update_time DESC LIMIT @limit`,
  project_item:
    kw => `SELECT p.id, p.update_time AS t FROM project_item p LEFT JOIN contents ct ON ct.id = p.content_id
    WHERE p.content_id IS NOT NULL ${kw ? "AND (p.title LIKE @kw OR ct.content LIKE @kw)" : ""}
    ORDER BY p.update_time DESC LIMIT @limit`,
  project:
    kw => `SELECT id, update_time AS t FROM project WHERE archived = 0 ${kw ? "AND title LIKE @kw" : ""}
    ORDER BY update_time DESC LIMIT @limit`,
  white_board: kw => `SELECT id, update_time AS t FROM white_boards
    ${kw ? "WHERE title LIKE @kw OR description LIKE @kw" : ""} ORDER BY update_time DESC LIMIT @limit`,
  // 日记正文在段落（diary_segments）里；按日期倒序更符合「最近」
  diary: kw => `SELECT d.id, d.update_time AS t FROM diary_entries d
    ${
      kw
        ? `WHERE d.date LIKE @kw OR EXISTS (SELECT 1 FROM diary_segments s JOIN contents ct ON ct.id = s.content_id
             WHERE s.diary_id = d.id AND ct.content LIKE @kw)`
        : ""
    } ORDER BY d.date DESC, d.update_time DESC LIMIT @limit`,
};

export default class EntitySearchTable {
  static upgradeTable(_db: Database.Database) {
    // 无自有表
  }

  static getListenEvents() {
    return {
      "entity:search": this.search.bind(this),
      "entity:locate": this.locate.bind(this),
    } as const;
  }

  static search(db: Database.Database, params: EntitySearchParams): EntityCandidate[] {
    const build = SEARCH_SQL[params.kind];
    if (!build) return [];
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const kw = params.keyword?.trim() ? `%${params.keyword.trim()}%` : null;
    const rows = db.prepare(build(kw != null)).all(kw ? { kw, limit } : { limit }) as {
      id: number;
      t: number;
    }[];
    return rows
      .map(row => this.resolve(db, params.kind, row.id, row.t))
      .filter((c): c is EntityCandidate => c !== null);
  }

  /** 由 content 反查所属实体；kind 缺省时依次尝试卡片 / 文章 / 项目文档 / 日记 */
  static locate(
    db: Database.Database,
    params: { contentId: number; kind?: EntityKind }
  ): EntityLocation | null {
    const kinds: EntityKind[] = params.kind
      ? [params.kind]
      : ["card", "article", "project_item", "diary"];
    const get = (sql: string) => db.prepare(sql).get(params.contentId) as any;
    for (const kind of kinds) {
      switch (kind) {
        case "card": {
          const row = get(`SELECT id FROM cards WHERE content_id = ?`);
          if (row) return { kind, id: row.id };
          break;
        }
        case "article": {
          const row = get(`SELECT id FROM articles WHERE content_id = ? AND is_delete = 0`);
          if (row) return { kind, id: row.id };
          break;
        }
        case "project_item": {
          const row = get(`SELECT id, projects FROM project_item WHERE content_id = ?`);
          if (row)
            return { kind, id: row.id, projectId: Number(parseJsonArray(row.projects)[0]) || null };
          break;
        }
        case "diary": {
          const row = get(
            `SELECT d.id, d.date FROM diary_segments s JOIN diary_entries d ON d.id = s.diary_id WHERE s.content_id = ?`
          );
          if (row) return { kind, id: row.id, date: row.date };
          break;
        }
      }
    }
    return null;
  }

  /** 单个实体的展示信息；已不存在返回 null */
  static resolve(
    db: Database.Database,
    kind: EntityKind,
    id: number,
    time: number
  ): EntityCandidate | null {
    const get = (sql: string) => db.prepare(sql).get(id) as any;
    const content = (contentId: number | null | undefined) =>
      contentId != null ? ContentTable.getContentById(db, contentId) : null;
    const base = { kind, id, time, meta: "", excerpt: "" };
    switch (kind) {
      case "card": {
        const card = get(`SELECT content_id FROM cards WHERE id = ?`);
        if (!card) return null;
        const [first = "", ...rest] = blockLines(content(card.content_id)?.content);
        return {
          ...base,
          contentId: card.content_id,
          title: first.slice(0, 80) || "无标题卡片",
          excerpt: rest.join(" ").slice(0, EXCERPT),
        };
      }
      case "article": {
        const article = get(`SELECT title, content_id, is_delete FROM articles WHERE id = ?`);
        if (!article || article.is_delete) return null;
        return {
          ...base,
          contentId: article.content_id,
          title: article.title || "无标题文章",
          excerpt: blockLines(content(article.content_id)?.content).join(" ").slice(0, EXCERPT),
        };
      }
      case "project_item": {
        const item = get(`SELECT title, content_id, projects FROM project_item WHERE id = ?`);
        if (!item) return null;
        const projectId = Number(parseJsonArray(item.projects)[0]) || null;
        const project =
          projectId != null
            ? (db.prepare(`SELECT title FROM project WHERE id = ?`).get(projectId) as
                { title: string } | undefined)
            : undefined;
        return {
          ...base,
          contentId: item.content_id,
          title: item.title || "无标题文档",
          excerpt: blockLines(content(item.content_id)?.content).join(" ").slice(0, EXCERPT),
          meta: project?.title ?? "",
        };
      }
      case "project": {
        const project = get(`SELECT title, "desc" AS d, children FROM project WHERE id = ?`);
        if (!project) return null;
        return {
          ...base,
          contentId: null,
          title: project.title || "无标题项目",
          excerpt: blockLines(parseJsonArray(project.d)).join(" ").slice(0, EXCERPT),
          meta: `${parseJsonArray(project.children).length} 篇文档`,
        };
      }
      case "white_board": {
        const board = get(
          `SELECT title, description, white_board_content_ids FROM white_boards WHERE id = ?`
        );
        if (!board) return null;
        const pages = parseJsonArray(board.white_board_content_ids).length;
        return {
          ...base,
          contentId: null,
          title: board.title || "无标题白板",
          excerpt: (board.description || "").slice(0, EXCERPT),
          meta: pages > 1 ? `${pages} 页` : "",
        };
      }
      case "diary": {
        const entry = DiaryTable.getDiaryEntryByIdOrNull(db, id);
        if (!entry) return null;
        // 关联落在首段（与全局搜索 diary-daily 的 contentId 口径一致）
        const contentId = entry.segments[0]?.contentId ?? null;
        if (contentId == null) return null;
        return {
          ...base,
          contentId,
          title: DiaryTable.getDiarySearchTitle(entry),
          excerpt: entry.segments
            .flatMap(s => blockLines(s.content))
            .join(" ")
            .slice(0, EXCERPT),
          meta: entry.segments.length > 1 ? `${entry.segments.length} 段` : "",
        };
      }
      default:
        return null;
    }
  }
}
