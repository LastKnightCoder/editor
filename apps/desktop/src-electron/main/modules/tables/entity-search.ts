/**
 * 通用实体检索（renderer EntityPicker 的后端）：按类型 LIKE 检索标题 / 正文，空关键字按最近更新。
 * 只读、无自有表；问题材料选择、待办关联笔记等「关联已有」场景共用。
 */

import Database from "better-sqlite3";
import dayjs from "dayjs";
import { normalizeDiaryDay } from "@/utils/diary-day";
import type { EntityCandidate, EntityKind, EntityLocation, EntitySearchParams } from "@/types";
import { ENTITY_REF_PRIORITY, type EntityRef, type EntityRefKind } from "@/entity/ref";
import { contentBlockLines } from "@/entity/text-digest";
import { contentTitles } from "./content-ai-meta";
import ContentTable from "./content";
import MaterialTable from "./material";

/** Slate 文档按块取纯文本：第一块即卡片的开头 */
export const blockLines = contentBlockLines;

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
/** IN 列表每批的正文数（一条语句里同一批参数要绑定 4 次，需低于 SQLite 变量上限） */
const LOCATE_BATCH = 200;

type RowKind = Exclude<EntityKind, "chat-session">;

const SEARCH_SQL: Record<RowKind, (kw: boolean) => string> = {
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
  "diary-moment": kw => `SELECT s.id, MAX(s.update_time, ct.update_time) AS t FROM diary_segments s
    JOIN contents ct ON ct.id = s.content_id
    ${kw ? "WHERE ct.content LIKE @kw" : ""}
    ORDER BY t DESC, s.id DESC LIMIT @limit`,
  // 摘录可达数万条：LIKE 全表扫 + LIMIT，规模实测见 entity-search-scale.eval.test.ts
  excerpt: kw => `SELECT id, update_time AS t FROM excerpt WHERE is_deleted = 0
    ${kw ? "AND (quote LIKE @kw OR note LIKE @kw OR source_title LIKE @kw)" : ""}
    ORDER BY update_time DESC LIMIT @limit`,
  "pdf-annotation":
    kw => `SELECT a.id, a.update_time AS t FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id
    ${kw ? "WHERE a.annotation_payload LIKE @kw OR a.notes LIKE @kw OR p.file_name LIKE @kw" : ""}
    ORDER BY a.update_time DESC LIMIT @limit`,
  // 只列仍挂在网页条目上的剪藏（孤儿剪藏打不开）
  todo: kw => `SELECT i.id, i.update_time AS t FROM todo_item i
    JOIN todo_group g ON g.id = i.group_id
    WHERE i.is_archived = 0 AND g.is_system = 0 ${kw ? "AND i.title LIKE @kw" : ""}
    ORDER BY i.update_time DESC LIMIT @limit`,
  // 系统日历只承载截止 / 周期标记，不是用户的日程
  "calendar-event": kw => `SELECT e.id, e.update_time AS t FROM calendar_event e
    JOIN calendar c ON c.id = e.calendar_id
    LEFT JOIN calendar_group g ON g.id = c.group_id
    WHERE IFNULL(g.is_system, 0) = 0 ${kw ? "AND e.title LIKE @kw" : ""}
    ORDER BY e.update_time DESC LIMIT @limit`,
  "web-clip": kw => `SELECT c.id, c.update_time AS t FROM web_clip c
    WHERE EXISTS (SELECT 1 FROM entity_lineage l JOIN project_item i ON i.id = CAST(l.src_id AS INTEGER)
      WHERE l.dst_kind = 'web-clip' AND l.dst_id = CAST(c.id AS TEXT)
        AND l.relation = 'clipped_from' AND l.src_kind = 'project-item')
    ${kw ? "AND (c.title LIKE @kw OR c.url LIKE @kw)" : ""}
    ORDER BY c.update_time DESC LIMIT @limit`,
};

const MATERIAL_KINDS = new Set<EntityKind>(["excerpt", "pdf-annotation", "web-clip"]);

const CHAT_SCOPE_LABEL: Record<string, string> = {
  "main-chat": "对话",
  "pdf-chat": "PDF 对话",
  "video-note-chat": "视频笔记对话",
  "vibe-learning-chat": "Notebook 对话",
};

export default class EntitySearchTable {
  static getListenEvents() {
    return {
      "entity:search": this.search.bind(this),
      "entity:locate": this.locate.bind(this),
    } as const;
  }

  static search(db: Database.Database, params: EntitySearchParams): EntityCandidate[] {
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const kw = params.keyword?.trim() ? `%${params.keyword.trim()}%` : null;
    if (!Array.isArray(params.kind)) return this.searchKind(db, params.kind, kw, limit);
    // 每种类型各取前 limit 条再合并，保证合并后的前 limit 条按时间正确
    return [...new Set(params.kind)]
      .flatMap(kind => this.searchKind(db, kind, kw, limit))
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);
  }

  private static searchKind(
    db: Database.Database,
    kind: EntityKind,
    kw: string | null,
    limit: number
  ): EntityCandidate[] {
    if (kind === "chat-session") return this.searchChats(db, kw, limit);
    const build = SEARCH_SQL[kind];
    if (!build) return [];
    const rows = db.prepare(build(kw != null)).all(kw ? { kw, limit } : { limit }) as {
      id: number;
      t: number;
    }[];
    if (MATERIAL_KINDS.has(kind)) return this.resolveMaterials(db, kind, rows);
    return rows
      .map(row => this.resolve(db, kind, row.id, row.t))
      .filter((c): c is EntityCandidate => c !== null);
  }

  private static resolveMaterials(
    db: Database.Database,
    kind: EntityKind,
    rows: { id: number; t: number }[]
  ): EntityCandidate[] {
    const time = new Map(rows.map(row => [row.id, row.t]));
    const refs = rows.map(row => ({ kind: kind as "excerpt", id: row.id }));
    return MaterialTable.resolve(db, refs).map(info => ({
      kind,
      id: info.ref.id,
      contentId: null,
      title: info.title,
      excerpt: (info.ref.kind === "web-clip" ? "" : info.note).slice(0, EXCERPT),
      meta: info.meta,
      time: time.get(info.ref.id) ?? 0,
    }));
  }

  private static searchChats(
    db: Database.Database,
    kw: string | null,
    limit: number
  ): EntityCandidate[] {
    const rows = db
      .prepare(
        `SELECT id, title, scope, message_count, update_time FROM chat_session
         ${kw ? "WHERE title LIKE @kw" : ""} ORDER BY update_time DESC LIMIT @limit`
      )
      .all(kw ? { kw, limit } : { limit }) as {
      id: string;
      title: string;
      scope: string;
      message_count: number;
      update_time: number;
    }[];
    return rows.map(row => ({
      kind: "chat-session",
      id: 0,
      sessionId: row.id,
      contentId: null,
      title: row.title || "未命名对话",
      excerpt: "",
      meta: [
        row.scope === "main-chat" ? "" : (CHAT_SCOPE_LABEL[row.scope] ?? ""),
        row.message_count ? `${row.message_count} 条消息` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      time: row.update_time,
    }));
  }

  /** 由 content 反查所属实体；kind 缺省时依次尝试卡片 / 文章 / 项目文档 / 日记 */
  static locate(
    db: Database.Database,
    params: { contentId: number; kind?: EntityKind }
  ): EntityLocation | null {
    const kinds: EntityKind[] = params.kind
      ? [params.kind]
      : ["card", "article", "project_item", "diary-moment"];
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
        case "diary-moment": {
          const row = get(
            `SELECT s.id, s.diary_id, d.date, d.create_time FROM diary_segments s
             JOIN diary_entries d ON d.id = s.diary_id WHERE s.content_id = ?`
          );
          if (row)
            return {
              kind,
              id: row.id,
              diaryId: row.diary_id,
              date: normalizeDiaryDay(row.date, row.create_time),
            };
          break;
        }
      }
    }
    return null;
  }

  /**
   * 一批正文各自对应的全部实体（一份正文可被卡片、文章、项目文档同时共用）。
   * 已软删的文章不计；同一份正文内按 卡片 > 文章 > 项目文档 > 日记 排序。
   */
  static locateAll(db: Database.Database, contentIds: number[]): Map<number, EntityRef[]> {
    const result = new Map<number, EntityRef[]>();
    const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))];
    for (let start = 0; start < ids.length; start += LOCATE_BATCH) {
      const batch = ids.slice(start, start + LOCATE_BATCH);
      const marks = batch.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT 'card' AS kind, id, content_id AS contentId FROM cards WHERE content_id IN (${marks})
           UNION ALL SELECT 'article', id, content_id FROM articles WHERE content_id IN (${marks}) AND is_delete = 0
           UNION ALL SELECT 'project-item', id, content_id FROM project_item WHERE content_id IN (${marks})
           UNION ALL SELECT DISTINCT 'diary-moment', s.id, s.content_id FROM diary_segments s
             JOIN diary_entries d ON d.id = s.diary_id WHERE s.content_id IN (${marks})`
        )
        .all(...batch, ...batch, ...batch, ...batch) as Array<{
        kind: EntityRefKind;
        id: number;
        contentId: number;
      }>;
      for (const row of rows) {
        const list = result.get(row.contentId) ?? [];
        list.push({ kind: row.kind, id: row.id });
        result.set(row.contentId, list);
      }
    }
    for (const list of result.values()) {
      list.sort((a, b) => ENTITY_REF_PRIORITY[a.kind] - ENTITY_REF_PRIORITY[b.kind] || a.id - b.id);
    }
    return result;
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
        const lines = blockLines(content(card.content_id)?.content);
        const aiTitle = contentTitles(db, [card.content_id], 0).get(card.content_id);
        // 有 AI 标题时开头那一块也是正文的一部分，留在摘要里
        return {
          ...base,
          contentId: card.content_id,
          title: aiTitle || lines[0]?.slice(0, 80) || "无标题卡片",
          excerpt: (aiTitle ? lines : lines.slice(1)).join(" ").slice(0, EXCERPT),
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
      case "todo": {
        const todo = get(
          `SELECT i.title, i.create_time, i.due_at, i.is_completed, g.title AS group_title
           FROM todo_item i LEFT JOIN todo_group g ON g.id = i.group_id WHERE i.id = ?`
        );
        if (!todo) return null;
        return {
          ...base,
          contentId: null,
          createdAt: todo.create_time,
          title: todo.title || "无标题待办",
          meta: [
            todo.group_title ?? "",
            todo.is_completed ? "已完成" : "",
            todo.due_at ? `截止 ${dayjs(todo.due_at).format("M月D日")}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }
      case "calendar-event": {
        const event = get(
          `SELECT e.title, e.create_time, e.start_date, e.all_day, c.title AS calendar_title
           FROM calendar_event e LEFT JOIN calendar c ON c.id = e.calendar_id WHERE e.id = ?`
        );
        if (!event) return null;
        return {
          ...base,
          contentId: null,
          createdAt: event.create_time,
          title: event.title || "无标题日程",
          meta: [event.calendar_title ?? "", dayjs(event.start_date).format("M月D日")]
            .filter(Boolean)
            .join(" · "),
        };
      }
      case "diary-moment": {
        const row = get(
          `SELECT s.content_id, s.diary_id, s.create_time, d.date, d.create_time AS day_create_time
           FROM diary_segments s JOIN diary_entries d ON d.id = s.diary_id WHERE s.id = ?`
        );
        if (!row) return null;
        const lines = blockLines(content(row.content_id)?.content);
        return {
          ...base,
          diaryId: row.diary_id,
          contentId: row.content_id,
          title: lines[0]?.slice(0, 40) || "空白日记",
          excerpt: lines.slice(1).join(" ").slice(0, EXCERPT),
          meta: `${normalizeDiaryDay(row.date, row.day_create_time)} ${dayjs(row.create_time).format("HH:mm")}`,
        };
      }
      default:
        return null;
    }
  }
}
