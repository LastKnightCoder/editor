import Database from "better-sqlite3";
import {
  isMaterialKind,
  materialKey,
  type MaterialInfo,
  type MaterialRef,
} from "@/entity/material";
import type { EntityRef } from "@/entity/ref";
import { parseQuoteAnchor, resolveQuoteAnchor } from "@/entity/quote-anchor";
import type {
  ActiveQuestionPreview,
  QuestionDetail,
  QuestionEvent,
  QuestionLink,
  QuestionLinkTarget,
  QuestionLinkTargetType,
  QuestionMaterial,
  QuestionSummary,
} from "@/types";
import ContentTable from "./content";
import EntitySearchTable from "./entity-search";
import MaterialTable from "./material";
import QuestionChatTable from "./question-chat";
import QuestionEventTable from "./question-event";
import QuestionGroupTable from "./question-group";
import QuestionTable from "./question";

const MIGRATION_KEY = "question-link:v1";
const SORT_STEP = 1024;

const TYPE_LABEL: Record<QuestionLinkTargetType, string> = {
  card: "卡片",
  article: "文章",
  project_item: "项目文档",
  project: "项目",
  white_board: "白板",
  answer: "独立答案",
  excerpt: "划线",
  "pdf-annotation": "PDF 标注",
  "web-clip": "剪藏",
};

interface LinkRow {
  anchor?: string | null;
  id: number;
  question_id: number;
  target_type: QuestionLinkTargetType;
  target_id: number;
  content_id: number | null;
  sort_index: number;
  create_time: number;
}

interface LinkOptions {
  /** 从问题里直接新建的材料（轨迹记为「写下 / 新建」而非「关联」） */
  created?: boolean;
  /** 为关联持有的 content 增加引用计数；新建的独立答案由问题独占首个引用，传 false */
  incRef?: boolean;
  createTime?: number;
}

/** Slate 文档按块取纯文本：第一块即卡片标题 */
const blockLines = (nodes: unknown): string[] => {
  const lines: string[] = [];
  const text = (node: any): string => {
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    if (typeof node.code === "string") return node.code;
    return Array.isArray(node.children) ? node.children.map(text).join("") : "";
  };
  if (Array.isArray(nodes)) nodes.forEach(node => lines.push(text(node).trim()));
  return lines.filter(Boolean);
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

export default class QuestionLinkTable {
  static upgradeTable(db: Database.Database) {
    const columns = db.prepare(`PRAGMA table_info(question_link)`).all() as { name: string }[];
    if (!columns.some(column => column.name === "content_id")) {
      db.exec(`ALTER TABLE question_link ADD COLUMN content_id INTEGER`);
    }
    if (!columns.some(column => column.name === "anchor")) {
      db.exec(`ALTER TABLE question_link ADD COLUMN anchor TEXT`);
    }
    this.backfill(db);
  }

  static getListenEvents() {
    return {
      "question:get-detail": this.getDetail.bind(this),
      "question:list-summaries": this.listSummaries.bind(this),
      "question:list-active": this.listActive.bind(this),
      "question:link-targets": this.linkTargets.bind(this),
      "question:unlink-target": this.unlinkTarget.bind(this),
      "question:reorder-links": this.reorderLinks.bind(this),
      "question:source-of-notebook": this.sourceOfNotebook.bind(this),
    } as const;
  }

  static parse(row: LinkRow): QuestionLink {
    return {
      id: row.id,
      questionId: row.question_id,
      targetType: row.target_type,
      targetId: row.target_id,
      sortIndex: row.sort_index,
      createTime: row.create_time,
      ...(parseQuoteAnchor(row.anchor) ? { anchor: parseQuoteAnchor(row.anchor)! } : {}),
    };
  }

  static rows(db: Database.Database, questionId: number): LinkRow[] {
    return db
      .prepare(`SELECT * FROM question_link WHERE question_id = ? ORDER BY sort_index ASC, id ASC`)
      .all(questionId) as LinkRow[];
  }

  static list(db: Database.Database, questionId: number): QuestionLink[] {
    return this.rows(db, questionId).map(row => this.parse(row));
  }

  /** content id → 它投影出的实体（卡片 / 文章 / 项目文档），都不是则为独立答案 */
  static resolveContentTarget(db: Database.Database, contentId: number): QuestionLinkTarget {
    const probe = (sql: string) =>
      (db.prepare(sql).get(contentId) as { id: number } | undefined)?.id;
    const card = probe(`SELECT id FROM cards WHERE content_id = ? LIMIT 1`);
    if (card != null) return { targetType: "card", targetId: card };
    const article = probe(
      `SELECT id FROM articles WHERE content_id = ? ORDER BY is_delete ASC LIMIT 1`
    );
    if (article != null) return { targetType: "article", targetId: article };
    const item = probe(`SELECT id FROM project_item WHERE content_id = ? LIMIT 1`);
    if (item != null) return { targetType: "project_item", targetId: item };
    return { targetType: "answer", targetId: contentId };
  }

  static contentIdOf(db: Database.Database, target: QuestionLinkTarget): number | null {
    const lookup = (table: string) =>
      (
        db.prepare(`SELECT content_id FROM ${table} WHERE id = ?`).get(target.targetId) as
          { content_id: number | null } | undefined
      )?.content_id ?? null;
    switch (target.targetType) {
      case "card":
        return lookup("cards");
      case "article":
        return lookup("articles");
      case "project_item":
        return lookup("project_item");
      case "answer":
        return target.targetId;
      default:
        return null;
    }
  }

  /** questions.answers 保留为 content id 缓存，供旧消费者（MCP / 发布 / 编辑器问题块）读取 */
  static syncAnswersCache(db: Database.Database, questionId: number) {
    const ids = this.rows(db, questionId)
      .map(row => row.content_id)
      .filter((id): id is number => id != null);
    db.prepare(`UPDATE questions SET answers = ? WHERE id = ?`).run(
      JSON.stringify(ids),
      questionId
    );
  }

  static insertLink(
    db: Database.Database,
    questionId: number,
    target: QuestionLinkTarget,
    options: LinkOptions = {}
  ): { link: QuestionLink; event: QuestionEvent } | null {
    const exists = db
      .prepare(
        `SELECT id FROM question_link WHERE question_id = ? AND target_type = ? AND target_id = ?`
      )
      .get(questionId, target.targetType, target.targetId);
    if (exists) return null;
    const contentId = this.contentIdOf(db, target);
    if (contentId != null && options.incRef) ContentTable.incrementRefCount(db, contentId);
    const max = db
      .prepare(`SELECT MAX(sort_index) AS m FROM question_link WHERE question_id = ?`)
      .get(questionId) as { m: number | null };
    const now = options.createTime ?? Date.now();
    const row: LinkRow = {
      id: 0,
      question_id: questionId,
      target_type: target.targetType,
      target_id: target.targetId,
      anchor: target.anchor ? JSON.stringify(target.anchor) : null,
      content_id: contentId,
      sort_index: (max.m ?? 0) + SORT_STEP,
      create_time: now,
    };
    row.id = Number(
      db
        .prepare(
          `INSERT INTO question_link (question_id, target_type, target_id, content_id, sort_index, create_time, anchor)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          questionId,
          target.targetType,
          target.targetId,
          contentId,
          row.sort_index,
          now,
          row.anchor
        ).lastInsertRowid
    );
    const [material] = this.resolveMaterials(db, [row]);
    const event = QuestionEventTable.log(
      db,
      questionId,
      "link",
      { ...target, created: Boolean(options.created), title: material.title },
      now
    );
    return { link: this.parse(row), event };
  }

  /**
   * 关联材料。第一份材料挂上时，待探究自动进入探究中（记一条 auto 状态事件）。
   * 返回新增的关联（已存在的跳过）。
   */
  static linkTargets(
    db: Database.Database,
    questionId: number,
    targets: QuestionLinkTarget[],
    options: LinkOptions = {}
  ): QuestionLink[] {
    const question = QuestionTable.getQuestionById(db, questionId);
    if (!question) throw new Error("问题不存在");
    const added = targets
      .map(target => this.insertLink(db, questionId, target, options))
      .filter((v): v is NonNullable<typeof v> => v != null);
    if (!added.length) return [];
    const now = Date.now();
    if (question.status === "not_started") {
      db.prepare(`UPDATE questions SET status = 'in_progress' WHERE id = ?`).run(questionId);
      QuestionEventTable.log(db, questionId, "status", { to: "in_progress", auto: true }, now);
    }
    db.prepare(`UPDATE questions SET update_time = ? WHERE id = ?`).run(now, questionId);
    this.syncAnswersCache(db, questionId);
    return added.map(v => v.link);
  }

  /** 解除关联：释放关联持有的 content 引用（独立答案引用归零即删除），材料本体不受影响 */
  static unlinkTarget(
    db: Database.Database,
    questionId: number,
    target: QuestionLinkTarget
  ): number {
    const row = db
      .prepare(
        `SELECT * FROM question_link WHERE question_id = ? AND target_type = ? AND target_id = ?`
      )
      .get(questionId, target.targetType, target.targetId) as LinkRow | undefined;
    if (!row) return 0;
    const [material] = this.resolveMaterials(db, [row]);
    db.prepare(`DELETE FROM question_link WHERE id = ?`).run(row.id);
    if (row.content_id != null) ContentTable.deleteContent(db, row.content_id);
    const now = Date.now();
    QuestionEventTable.log(db, questionId, "unlink", { ...target, title: material.title }, now);
    db.prepare(`UPDATE questions SET update_time = ? WHERE id = ?`).run(now, questionId);
    this.syncAnswersCache(db, questionId);
    return 1;
  }

  static reorderLinks(db: Database.Database, questionId: number, linkIds: number[]): number {
    const upd = db.prepare(
      `UPDATE question_link SET sort_index = ? WHERE id = ? AND question_id = ?`
    );
    linkIds.forEach((id, idx) => upd.run((idx + 1) * SORT_STEP, id, questionId));
    this.syncAnswersCache(db, questionId);
    return linkIds.length;
  }

  /** 删除问题时：释放全部引用并清理关联、探究对话与轨迹 */
  static releaseAll(db: Database.Database, questionId: number) {
    this.rows(db, questionId).forEach(row => {
      if (row.content_id != null) ContentTable.deleteContent(db, row.content_id);
    });
    db.prepare(`DELETE FROM question_link WHERE question_id = ?`).run(questionId);
    QuestionChatTable.deleteByQuestion(db, questionId);
    QuestionEventTable.deleteByQuestion(db, questionId);
  }

  static resolveMaterials(db: Database.Database, rows: LinkRow[]): QuestionMaterial[] {
    const refs: MaterialRef[] = rows.flatMap(row =>
      isMaterialKind(row.target_type) ? [{ kind: row.target_type, id: row.target_id }] : []
    );
    const materials = new Map<string, MaterialInfo>(
      refs.length ? MaterialTable.resolve(db, refs).map(info => [materialKey(info.ref), info]) : []
    );
    // 答案不迁移到投影出的身份（KL-041）：按共用正文找出它「也是」哪些卡片 / 文章 / 项目文档
    const answerIds = rows.filter(row => row.target_type === "answer").map(row => row.target_id);
    const projections = answerIds.length
      ? EntitySearchTable.locateAll(db, answerIds)
      : new Map<number, EntityRef[]>();
    return rows
      .map(row => {
        const base: QuestionMaterial = {
          ...this.parse(row),
          title: `${TYPE_LABEL[row.target_type] ?? "材料"} #${row.target_id}`,
          excerpt: "",
          meta: "",
          words: 0,
          targetCreateTime: row.create_time,
          contentId: row.content_id,
          projectId: null,
          boardContentId: null,
          missing: false,
        };
        const content = (id: number | null) =>
          id != null ? ContentTable.getContentById(db, id) : null;
        const get = (sql: string) => db.prepare(sql).get(row.target_id) as any;
        switch (row.target_type) {
          case "card":
          case "answer": {
            if (row.target_type === "card") {
              const card = get(`SELECT id, create_time, content_id FROM cards WHERE id = ?`);
              if (!card) return { ...base, missing: true };
              base.targetCreateTime = card.create_time;
              base.contentId = card.content_id;
            }
            const c = content(base.contentId);
            if (!c) return { ...base, missing: true };
            const [first = "", ...rest] = blockLines(c.content);
            if (row.target_type === "answer") base.targetCreateTime = c.createTime;
            return {
              ...base,
              title: first.slice(0, 80) || (row.target_type === "card" ? "无标题卡片" : "空白答案"),
              excerpt: rest.join(" ").slice(0, 160),
              words: c.count ?? 0,
              ...(row.target_type === "answer"
                ? {
                    projections: (projections.get(row.target_id) ?? []).filter(
                      r => r.kind !== "diary"
                    ),
                  }
                : {}),
            };
          }
          case "article": {
            const article = get(
              `SELECT id, title, create_time, content_id, is_delete FROM articles WHERE id = ?`
            );
            if (!article || article.is_delete) return { ...base, missing: true };
            const c = content(article.content_id);
            return {
              ...base,
              title: article.title || "无标题文章",
              excerpt: blockLines(c?.content).join(" ").slice(0, 160),
              words: c?.count ?? 0,
              targetCreateTime: article.create_time,
              contentId: article.content_id,
            };
          }
          case "project_item": {
            const item = get(
              `SELECT id, title, create_time, content_id, projects FROM project_item WHERE id = ?`
            );
            if (!item) return { ...base, missing: true };
            const projectId = Number(parseJsonArray(item.projects)[0]) || null;
            const project =
              projectId != null
                ? (db.prepare(`SELECT title FROM project WHERE id = ?`).get(projectId) as
                    { title: string } | undefined)
                : undefined;
            const c = content(item.content_id);
            return {
              ...base,
              title: item.title || "无标题文档",
              excerpt: blockLines(c?.content).join(" ").slice(0, 160),
              meta: project?.title ?? "",
              words: c?.count ?? 0,
              targetCreateTime: item.create_time,
              contentId: item.content_id,
              projectId,
            };
          }
          case "project": {
            const project = get(
              `SELECT id, title, create_time, "desc" AS d, children FROM project WHERE id = ?`
            );
            if (!project) return { ...base, missing: true };
            const docs = parseJsonArray(project.children).length;
            return {
              ...base,
              title: project.title || "无标题项目",
              excerpt: blockLines(parseJsonArray(project.d)).join(" ").slice(0, 160),
              meta: `${docs} 篇文档`,
              targetCreateTime: project.create_time,
              projectId: project.id,
            };
          }
          case "white_board": {
            const board = get(
              `SELECT id, title, description, create_time, white_board_content_ids, active_white_board_content_id AS active FROM white_boards WHERE id = ?`
            );
            if (!board) return { ...base, missing: true };
            const boardPages = parseJsonArray(board.white_board_content_ids).map(Number);
            const pages = boardPages.length;
            return {
              ...base,
              title: board.title || "无标题白板",
              excerpt: (board.description || "").slice(0, 160),
              meta: pages > 1 ? `${pages} 页` : "",
              targetCreateTime: board.create_time,
              boardContentId: board.active ?? boardPages[0] ?? null,
            };
          }
          case "excerpt":
          case "pdf-annotation":
          case "web-clip": {
            const info = materials.get(materialKey({ kind: row.target_type, id: row.target_id }));
            if (!info) return { ...base, missing: true };
            return {
              ...base,
              title: info.title,
              excerpt: [info.quote, info.note].filter(Boolean).join(" · ").slice(0, 160),
              meta: info.deleted ? `${info.meta} · 原划线已删除` : info.meta,
              material: info,
            };
          }
          default:
            return { ...base, missing: true };
        }
      })
      .map(material => {
        if (!material.anchor) return material;
        const content = material.contentId
          ? ContentTable.getContentById(db, material.contentId)?.content
          : [];
        const resolved = resolveQuoteAnchor(content ?? [], material.anchor);
        return {
          ...material,
          excerpt: material.anchor.exact,
          anchorLost: resolved.status === "lost",
        };
      });
  }

  /** 问题立项出的 Notebook（谱系 upgraded_to）；Notebook 已删除时为 null */
  static notebookOf(db: Database.Database, questionId: number): QuestionDetail["notebook"] {
    const row = db
      .prepare(
        `SELECT p.id, p.title FROM entity_lineage l
         JOIN vibe_learning_project p ON p.id = CAST(l.dst_id AS INTEGER)
         WHERE l.src_kind = 'question' AND l.src_id = ? AND l.relation = 'upgraded_to'
           AND l.dst_kind = 'vl-project'
         ORDER BY l.id DESC LIMIT 1`
      )
      .get(String(questionId)) as { id: number; title: string } | undefined;
    return row ? { id: row.id, title: row.title || "未命名 Notebook" } : null;
  }

  /** Notebook 由哪个问题立项；问题已删除时为 null */
  static sourceOfNotebook(
    db: Database.Database,
    projectId: number
  ): { id: number; title: string } | null {
    const row = db
      .prepare(
        `SELECT q.id, q.question_content AS title FROM entity_lineage l
         JOIN questions q ON q.id = CAST(l.src_id AS INTEGER)
         WHERE l.dst_kind = 'vl-project' AND l.dst_id = ? AND l.relation = 'upgraded_to'
           AND l.src_kind = 'question'
         ORDER BY l.id DESC LIMIT 1`
      )
      .get(String(projectId)) as { id: number; title: string | null } | undefined;
    return row ? { id: row.id, title: row.title || "未命名问题" } : null;
  }

  /**
   * 材料选择器候选：按类型检索（关键字为空时按最近更新），标出已关联项。
   * 卡片 / 文章 / 项目文档按正文 JSON 模糊匹配——个人库量级下足够，避免依赖索引库就绪。
   */
  static getDetail(db: Database.Database, questionId: number): QuestionDetail | null {
    const question = QuestionTable.getQuestionById(db, questionId);
    if (!question) return null;
    return {
      question,
      materials: this.resolveMaterials(db, this.rows(db, questionId)),
      chats: QuestionChatTable.list(db, questionId),
      events: QuestionEventTable.list(db, questionId),
      notebook: this.notebookOf(db, questionId),
    };
  }

  static linkCountsByQuestion(db: Database.Database) {
    const map = new Map<number, QuestionSummary["linkCounts"]>();
    (
      db
        .prepare(
          `SELECT question_id, target_type, COUNT(*) AS n FROM question_link GROUP BY question_id, target_type`
        )
        .all() as { question_id: number; target_type: QuestionLinkTargetType; n: number }[]
    ).forEach(row => {
      const counts = map.get(row.question_id) ?? {};
      counts[row.target_type] = row.n;
      map.set(row.question_id, counts);
    });
    QuestionChatTable.countsByQuestion(db).forEach((n, questionId) => {
      map.set(questionId, { ...map.get(questionId), "chat-session": n });
    });
    return map;
  }

  static lastActivityByQuestion(db: Database.Database) {
    const map = new Map<number, number>();
    (
      db
        .prepare(
          `SELECT question_id, MAX(create_time) AS t FROM question_event GROUP BY question_id`
        )
        .all() as { question_id: number; t: number }[]
    ).forEach(row => map.set(row.question_id, row.t));
    return map;
  }

  /** 问题页列表：全部问题 + 材料构成 + 最近活动时间 */
  static listSummaries(db: Database.Database): QuestionSummary[] {
    const counts = this.linkCountsByQuestion(db);
    const activity = this.lastActivityByQuestion(db);
    return QuestionTable.getAllQuestionSummaries(db).map(q => ({
      ...q,
      linkCounts: counts.get(q.id) ?? {},
      lastActivityTime: Math.max(q.updateTime, activity.get(q.id) ?? 0),
    }));
  }

  /** 首页：探究中的问题，按最近活动排序 */
  static listActive(db: Database.Database, limit = 5): ActiveQuestionPreview[] {
    const groups = new Map(QuestionGroupTable.listGroups(db).map(g => [g.id, g]));
    const active = this.listSummaries(db)
      .filter(q => q.status === "in_progress")
      .sort((a, b) => b.lastActivityTime - a.lastActivityTime)
      .slice(0, Math.min(Math.max(limit, 1), 20));
    const latest = QuestionEventTable.latestByQuestionIds(
      db,
      active.map(q => q.id)
    );
    return active.map(q => {
      const group = groups.get(q.groupId);
      const lastEvent = latest.get(q.id) ?? null;
      const payload = lastEvent?.payload as { title?: string; text?: string } | undefined;
      return {
        ...q,
        groupTitle: group?.title ?? "",
        groupColor: group?.color,
        lastEvent,
        lastEventTitle: payload?.title ?? payload?.text ?? null,
      };
    });
  }

  /**
   * 一次性迁移：questions.answers（content id 数组）→ question_link，并回填轨迹。
   * 引用计数沿用旧数据（旧关联已持有引用），不增减。
   * 旧 resolved_time 语义是「首个答案时间」，非已解答的问题清空该字段。
   */
  static backfill(db: Database.Database) {
    const done = db.prepare(`SELECT value FROM migration_meta WHERE key = ?`).get(MIGRATION_KEY);
    if (done) return;
    const questions = db
      .prepare(`SELECT id, create_time, update_time, answers, status, resolved_time FROM questions`)
      .all() as {
      id: number;
      create_time: number;
      update_time: number;
      answers: string | null;
      status: string;
      resolved_time: number | null;
    }[];
    const insert = db.prepare(
      `INSERT OR IGNORE INTO question_link (question_id, target_type, target_id, content_id, sort_index, create_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const hasEvents = db.prepare(`SELECT 1 FROM question_event WHERE question_id = ? LIMIT 1`);
    for (const q of questions) {
      const contentIds = parseJsonArray(q.answers)
        .map(Number)
        .filter(id => Number.isFinite(id));
      const logEvents = !hasEvents.get(q.id);
      if (logEvents) QuestionEventTable.log(db, q.id, "create", {}, q.create_time);
      let firstLinkTime: number | null = null;
      contentIds.forEach((contentId, idx) => {
        const content = db
          .prepare(`SELECT create_time FROM contents WHERE id = ?`)
          .get(contentId) as { create_time: number } | undefined;
        if (!content) return;
        const target = this.resolveContentTarget(db, contentId);
        // 早于提问的材料无法得知关联时刻，按提问时间记
        const linkTime = Math.max(content.create_time, q.create_time);
        insert.run(
          q.id,
          target.targetType,
          target.targetId,
          contentId,
          (idx + 1) * SORT_STEP,
          linkTime
        );
        firstLinkTime = firstLinkTime == null ? linkTime : Math.min(firstLinkTime, linkTime);
        if (logEvents) {
          const [material] = this.resolveMaterials(
            db,
            this.rows(db, q.id).filter(
              r => r.target_type === target.targetType && r.target_id === target.targetId
            )
          );
          QuestionEventTable.log(
            db,
            q.id,
            "link",
            {
              ...target,
              created: content.create_time >= q.create_time,
              title: material?.title,
              estimated: true,
            },
            linkTime
          );
        }
      });
      if (logEvents && q.status === "resolved") {
        const at = q.resolved_time ?? q.update_time;
        QuestionEventTable.log(db, q.id, "status", { to: "resolved", estimated: true }, at);
      } else if (logEvents && q.status === "in_progress" && firstLinkTime != null) {
        QuestionEventTable.log(
          db,
          q.id,
          "status",
          { to: "in_progress", auto: true, estimated: true },
          firstLinkTime
        );
      }
      if (q.status !== "resolved" && q.resolved_time != null) {
        db.prepare(`UPDATE questions SET resolved_time = NULL WHERE id = ?`).run(q.id);
      }
      this.syncAnswersCache(db, q.id);
    }
    db.prepare(`INSERT INTO migration_meta (key, value) VALUES (?, ?)`).run(
      MIGRATION_KEY,
      String(Date.now())
    );
  }
}
