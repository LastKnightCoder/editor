/**
 * 问题管理迁入插件 tau.questions（PS-046，81 第 8 节）：把旧表 question_group / questions /
 * question_link / question_chat / question_event 写成插件的实体、记录与关联，数据形状见插件仓库
 * DEVELOPMENT.md。调用方先确认插件已安装并启用（否则迁入的数据会被当作孤儿回收）。
 *
 * - 单事务；失败整体回滚、旧表原样保留，下次重试。成功后删除旧表（D-091 最后升级）。
 * - 实体 key、记录与关联 ID 由旧 ID 推出（legacy-…），旧表因同步回到库里时再次执行不会重复。
 * - 独立答案本来就是 contents 行：直接作为答案实体的正文，问题关联持有的那份引用计数转给实体；
 *   其余材料的保活引用释放，已删除、只靠问题撑着的材料随之回收。
 * - 宿主侧引用：谱系的 question 端点改为插件实体，首页布局的 questions 改为插件面板，
 *   发布站的 quest 选择删除。
 * 全部设备迁移后随清洁版删除（旧表名进 legacy-tables.json）。
 */

import type Database from "better-sqlite3";
import { basename } from "node:path";
import type { Descendant } from "slate";
import { groupTone } from "@/utils/groupTone";
import ContentTable from "./tables/content";
import { getNextTaskEntityId } from "./tables/module-entity-id";
import { MATERIAL_SQL, NUMERIC_KINDS } from "./tables/plugin-ref-kinds";

export const QUESTIONS_PLUGIN_ID = "tau.questions";
/** 插件注册的首页面板 ID（plugin:<插件>:<面板>） */
export const QUESTIONS_HOME_PANEL = `plugin:${QUESTIONS_PLUGIN_ID}:active`;

export const LEGACY_QUESTION_TABLES = [
  "question_event",
  "question_chat",
  "question_link",
  "questions",
  "question_group",
] as const;

const EMPTY_CONTENT = [{ type: "paragraph", children: [{ text: "" }] }];
/** 迁移前首页的默认顺序（没调整过首页的用户看到的就是它）：问题面板换成插件面板后按此写下布局 */
const LEGACY_HOME_ORDER = [
  "review",
  "todos",
  "schedule",
  "insights",
  "recent-edits",
  "questions",
  "walk",
  "retro",
] as const;
const TITLE_LENGTH = 40;

type CompositionKind =
  | "card"
  | "article"
  | "document"
  | "project"
  | "whiteboard"
  | "excerpt"
  | "pdf-annotation"
  | "web-clip"
  | "chat-session"
  | "answer";

interface GroupRow {
  id: number;
  title: string;
  color: string | null;
  sort_index: number;
  is_default: number;
  create_time: number;
  update_time: number;
}

interface QuestionRow {
  id: number;
  create_time: number;
  update_time: number;
  question_content: string | null;
  group_id: number | null;
  sort_index: number;
  resolved_time: number | null;
  status: string;
  description: string | null;
}

interface LinkRow {
  id: number;
  question_id: number;
  target_type: string;
  target_id: number;
  content_id: number | null;
  sort_index: number;
  create_time: number;
}

interface ChatRow {
  id: number;
  question_id: number;
  session_id: string;
  message_ids: string | null;
  create_time: number;
}

interface EventRow {
  id: number;
  question_id: number;
  type: string;
  payload: string;
  create_time: number;
}

interface PluginRef {
  kind: string;
  id: string;
}

export interface QuestionMigrationResult {
  questions: number;
  answers: number;
  groups: number;
  links: number;
  events: number;
}

const hasTable = (db: Database.Database, name: string) =>
  Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n;

/** 库里有没有要迁的问题数据：问题，或用户自建的分组（默认分组每次开库都会补建，不算） */
export function hasLegacyQuestions(db: Database.Database): boolean {
  if (!hasTable(db, "questions") || !hasTable(db, "question_group")) return false;
  return (
    count(db, `SELECT COUNT(*) AS n FROM questions`) > 0 ||
    count(db, `SELECT COUNT(*) AS n FROM question_group WHERE is_default = 0`) > 0
  );
}

const STATUSES = new Set(["not_started", "in_progress", "resolved"]);

/** 旧材料类型 → 插件引用与构成类型 */
function materialRef(targetType: string, targetId: number): [PluginRef, CompositionKind] | null {
  const id = String(targetId);
  switch (targetType) {
    case "card":
    case "article":
    case "project":
      return [{ kind: targetType, id }, targetType];
    case "project_item":
      return [{ kind: "document", id }, "document"];
    case "white_board":
      return [{ kind: "whiteboard", id }, "whiteboard"];
    case "excerpt":
    case "pdf-annotation":
    case "web-clip":
      return [{ kind: "material", id: `${targetType}:${id}` }, targetType];
    default:
      return null;
  }
}

/** 目标当前的创建时间（插件关联与引用登记用）；已不存在时为 null */
function refCreatedAt(db: Database.Database, ref: PluginRef): number | null {
  const time = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { create_time: number } | undefined)?.create_time ?? null;
  if (NUMERIC_KINDS[ref.kind]) return time(NUMERIC_KINDS[ref.kind].sql, Number(ref.id));
  if (ref.kind === "material") {
    const [kind, id] = ref.id.split(":");
    return MATERIAL_SQL[kind] ? time(MATERIAL_SQL[kind], Number(id)) : null;
  }
  if (ref.kind === "chat-session")
    return time(`SELECT create_time FROM chat_session WHERE id = ?`, ref.id);
  return null;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 正文第一行文字（答案的标题） */
function firstLine(nodes: unknown): string {
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const value = node as { text?: unknown; children?: unknown };
    if (typeof value.text === "string") texts.push(value.text);
    if (Array.isArray(value.children)) value.children.forEach(walk);
  };
  for (const block of Array.isArray(nodes) ? nodes : []) {
    texts.length = 0;
    walk(block);
    const line = texts.join("").replace(/\s+/g, " ").trim();
    if (line) return line.slice(0, TITLE_LENGTH);
  }
  return "";
}

/**
 * 执行迁移；没有旧数据时什么也不做（返回 null）。调用方保证插件已安装并启用。
 * 写入不经插件进程，直接按插件数据层的表结构落库。
 */
export function migrateQuestionsToPlugin(
  db: Database.Database,
  now = Date.now()
): QuestionMigrationResult | null {
  if (!hasLegacyQuestions(db)) return null;
  return db.transaction(() => {
    const pluginId = QUESTIONS_PLUGIN_ID;
    const result: QuestionMigrationResult = {
      questions: 0,
      answers: 0,
      groups: 0,
      links: 0,
      events: 0,
    };

    const insertRecord = db.prepare(
      `INSERT OR IGNORE INTO plugin_records (id, plugin_id, collection, data, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertEntity = db.prepare(
      `INSERT INTO plugin_entities (id, plugin_id, kind, key, title, content_id, meta, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const findEntity = db.prepare(
      `SELECT id FROM plugin_entities WHERE plugin_id = ? AND kind = ? AND key = ?`
    );
    const insertLink = db.prepare(
      `INSERT OR IGNORE INTO plugin_links
         (id, plugin_id, from_id, to_kind, to_id, to_created_at, role, sort_index, data, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const grant = db.prepare(
      `INSERT OR IGNORE INTO plugin_ref_grants (plugin_id, kind, ref_id, target_created_at, create_time)
       VALUES (?, ?, ?, ?, ?)`
    );

    /* 分组：插件启用时可能已经建了默认分组，旧默认分组并入它 */
    const groupIds = new Map<number, string>();
    const existingDefault = (
      db
        .prepare(
          `SELECT id FROM plugin_records WHERE plugin_id = ? AND collection = 'groups'
             AND json_extract(data, '$.isDefault') = 1 AND id NOT LIKE 'legacy-%' LIMIT 1`
        )
        .get(pluginId) as { id: string } | undefined
    )?.id;
    for (const group of db
      .prepare(`SELECT * FROM question_group ORDER BY sort_index, id`)
      .all() as GroupRow[]) {
      if (group.is_default && existingDefault) {
        groupIds.set(group.id, existingDefault);
        continue;
      }
      const id = `legacy-group-${group.id}`;
      groupIds.set(group.id, id);
      result.groups += insertRecord.run(
        id,
        pluginId,
        "groups",
        JSON.stringify({
          title: group.title,
          tone: groupTone(group.color),
          sortIndex: group.sort_index,
          isDefault: group.is_default === 1,
        }),
        group.create_time,
        group.update_time
      ).changes;
    }
    const defaultGroup =
      [...groupIds.entries()].find(([oldId]) =>
        Boolean(
          db.prepare(`SELECT 1 FROM question_group WHERE id = ? AND is_default = 1`).get(oldId)
        )
      )?.[1] ?? existingDefault;

    const links = db
      .prepare(`SELECT * FROM question_link ORDER BY question_id, sort_index, id`)
      .all() as LinkRow[];
    const chats = db
      .prepare(`SELECT * FROM question_chat ORDER BY question_id, create_time, id`)
      .all() as ChatRow[];
    const events = db
      .prepare(`SELECT * FROM question_event ORDER BY question_id, create_time, id`)
      .all() as EventRow[];
    const lineage = db
      .prepare(
        `SELECT src_id, dst_kind, dst_id, relation FROM entity_lineage
         WHERE src_kind = 'question' AND relation IN ('upgraded_to', 'discussed_in')`
      )
      .all() as Array<{ src_id: string; dst_kind: string; dst_id: string; relation: string }>;

    /* 问题 */
    const questionIds = new Map<number, number>();
    const questions = db.prepare(`SELECT * FROM questions ORDER BY id`).all() as QuestionRow[];
    for (const question of questions) {
      const key = `legacy-${question.id}`;
      const existing = findEntity.get(pluginId, "question", key) as { id: number } | undefined;
      if (existing) {
        questionIds.set(question.id, existing.id);
        continue;
      }
      const composition: Partial<Record<CompositionKind, number>> = {};
      for (const link of links.filter(item => item.question_id === question.id)) {
        const kind =
          link.target_type === "answer"
            ? "answer"
            : materialRef(link.target_type, link.target_id)?.[1];
        if (kind) composition[kind] = (composition[kind] ?? 0) + 1;
      }
      const chatCount = chats.filter(chat => chat.question_id === question.id).length;
      if (chatCount) composition["chat-session"] = chatCount;
      const lastEvent = events
        .filter(event => event.question_id === question.id)
        .reduce((max, event) => Math.max(max, event.create_time), 0);
      const description = parseJson<unknown>(question.description, null);
      const content =
        Array.isArray(description) && description.length
          ? (description as Descendant[])
          : EMPTY_CONTENT;
      const id = getNextTaskEntityId(db, "plugin_entities");
      insertEntity.run(
        id,
        pluginId,
        "question",
        key,
        question.question_content ?? "",
        ContentTable.createContent(db, { content: content as Descendant[] }),
        JSON.stringify({
          status: STATUSES.has(question.status) ? question.status : "not_started",
          groupId:
            (question.group_id != null && groupIds.get(question.group_id)) || defaultGroup || "",
          sortIndex: question.sort_index,
          resolvedTime: question.status === "resolved" ? question.resolved_time : null,
          activityAt: Math.max(question.update_time, lastEvent),
          composition,
        }),
        question.create_time,
        question.update_time
      );
      questionIds.set(question.id, id);
      result.questions++;
    }

    const addLink = (
      id: string,
      from: number,
      ref: PluginRef,
      role: string,
      sortIndex: number,
      data: Record<string, unknown>,
      createdAt: number
    ) => {
      const targetCreatedAt = refCreatedAt(db, ref);
      // 目标已删除的照样迁入，插件按「已删除」显示，可解除关联
      result.links += insertLink.run(
        id,
        pluginId,
        from,
        ref.kind,
        ref.id,
        targetCreatedAt ?? 0,
        role,
        sortIndex,
        JSON.stringify(data),
        createdAt
      ).changes;
      if (targetCreatedAt != null) grant.run(pluginId, ref.kind, ref.id, targetCreatedAt, now);
    };

    /* 材料与独立答案 */
    const answerIds = new Map<number, number>();
    const releases: number[] = [];
    for (const link of links) {
      const from = questionIds.get(link.question_id);
      if (from === undefined) {
        if (link.content_id != null) releases.push(link.content_id);
        continue;
      }
      if (link.target_type !== "answer") {
        const mapped = materialRef(link.target_type, link.target_id);
        if (mapped)
          addLink(
            `legacy-link-${link.id}`,
            from,
            mapped[0],
            "material",
            link.sort_index,
            {},
            link.create_time
          );
        if (link.content_id != null) releases.push(link.content_id);
        continue;
      }
      const contentId = link.target_id;
      const key = `legacy-${contentId}`;
      const content = db
        .prepare(`SELECT content, create_time, update_time FROM contents WHERE id = ?`)
        .get(contentId) as
        { content: string; create_time: number; update_time: number } | undefined;
      const existing = findEntity.get(pluginId, "answer", key) as { id: number } | undefined;
      let answerId = existing?.id;
      if (
        answerId === undefined &&
        content &&
        link.content_id === contentId &&
        !answerIds.has(contentId)
      ) {
        const projections = [
          ...(
            db.prepare(`SELECT id FROM cards WHERE content_id = ?`).all(contentId) as {
              id: number;
            }[]
          ).map(row => ({ kind: "card", id: String(row.id) })),
          ...(
            db
              .prepare(`SELECT id FROM articles WHERE content_id = ? AND is_delete = 0`)
              .all(contentId) as { id: number }[]
          ).map(row => ({ kind: "article", id: String(row.id) })),
          ...(
            db.prepare(`SELECT id FROM project_item WHERE content_id = ?`).all(contentId) as {
              id: number;
            }[]
          ).map(row => ({ kind: "document", id: String(row.id) })),
        ];
        answerId = getNextTaskEntityId(db, "plugin_entities");
        // 问题关联持有的那份引用计数转给答案实体，不增不减
        insertEntity.run(
          answerId,
          pluginId,
          "answer",
          key,
          firstLine(parseJson<unknown>(content.content, [])),
          contentId,
          JSON.stringify({ questionId: String(from), projections }),
          content.create_time,
          content.update_time
        );
        result.answers++;
      } else if (link.content_id != null && answerId === undefined) {
        releases.push(link.content_id);
      } else if (existing && link.content_id != null) {
        // 已迁过（旧表随同步回来）：这份引用不再需要
        releases.push(link.content_id);
      }
      if (answerId === undefined) continue;
      answerIds.set(contentId, answerId);
      addLink(
        `legacy-link-${link.id}`,
        from,
        { kind: "plugin-entity", id: String(answerId) },
        "answer",
        link.sort_index,
        {},
        link.create_time
      );
    }

    /* 对话 */
    const initiated = new Set(
      lineage
        .filter(row => row.relation === "discussed_in")
        .map(row => `${row.src_id}:${row.dst_id}`)
    );
    chats.forEach((chat, index) => {
      const from = questionIds.get(chat.question_id);
      if (from === undefined) return;
      const messageIds = parseJson<unknown>(chat.message_ids, []);
      addLink(
        `legacy-chat-${chat.id}`,
        from,
        { kind: "chat-session", id: chat.session_id },
        "chat",
        index,
        {
          ...(Array.isArray(messageIds) && messageIds.length ? { messageIds } : {}),
          ...(initiated.has(`${chat.question_id}:${chat.session_id}`) ? { initiated: true } : {}),
        },
        chat.create_time
      );
    });

    /* 立项的 Notebook */
    for (const row of lineage.filter(
      item => item.relation === "upgraded_to" && item.dst_kind === "vl-project"
    )) {
      const from = questionIds.get(Number(row.src_id));
      if (from !== undefined)
        addLink(
          `legacy-notebook-${row.src_id}`,
          from,
          { kind: "notebook", id: row.dst_id },
          "notebook",
          0,
          {},
          now
        );
    }

    /* 轨迹 */
    for (const event of events) {
      const questionId = questionIds.get(event.question_id);
      if (questionId === undefined) continue;
      const data = legacyEventData(event, String(questionId), answerIds);
      if (!data) continue;
      result.events += insertRecord.run(
        `legacy-event-${event.id}`,
        pluginId,
        "events",
        JSON.stringify(data),
        event.create_time,
        event.create_time
      ).changes;
    }

    /* 宿主侧引用 */
    for (const [oldId, newId] of questionIds) {
      for (const side of ["src", "dst"] as const) {
        db.prepare(
          `UPDATE OR IGNORE entity_lineage SET ${side}_kind = 'plugin-entity', ${side}_id = ?
           WHERE ${side}_kind = 'question' AND ${side}_id = ?`
        ).run(String(newId), String(oldId));
      }
    }
    db.prepare(
      `DELETE FROM entity_lineage WHERE src_kind = 'question' OR dst_kind = 'question'`
    ).run();
    if (hasTable(db, "home_panel_layout")) {
      // 没调整过首页时插件面板会排到末尾：先按迁移前的默认顺序写下布局，保住原位置
      if (count(db, `SELECT COUNT(*) AS n FROM home_panel_layout`) === 0) {
        const insert = db.prepare(
          `INSERT INTO home_panel_layout (panel_id, sort, hidden, update_time) VALUES (?, ?, 0, ?)`
        );
        LEGACY_HOME_ORDER.forEach((id, index) => insert.run(id, index, now));
      }
      db.prepare(
        `UPDATE OR IGNORE home_panel_layout SET panel_id = ?, update_time = ? WHERE panel_id = 'questions'`
      ).run(QUESTIONS_HOME_PANEL, now);
      db.prepare(`DELETE FROM home_panel_layout WHERE panel_id = 'questions'`).run();
    }
    if (hasTable(db, "publish_selections"))
      db.prepare(`DELETE FROM publish_selections WHERE content_type = 'quest'`).run();

    /* 释放材料保活，删旧表 */
    for (const contentId of releases) ContentTable.deleteContent(db, contentId);
    for (const table of LEGACY_QUESTION_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
    return result;
  })();
}

/** 旧轨迹 → 插件 events 记录的 data；认不出的返回 null（不迁） */
function legacyEventData(
  event: EventRow,
  questionId: string,
  answerIds: ReadonlyMap<number, number>
): Record<string, unknown> | null {
  const payload = parseJson<Record<string, unknown>>(event.payload, {});
  const estimated = payload.estimated === true ? { estimated: true } : {};
  const title = typeof payload.title === "string" && payload.title ? { title: payload.title } : {};
  switch (event.type) {
    case "create":
      return { questionId, type: "create", ...estimated };
    case "status":
      return STATUSES.has(payload.to as string)
        ? {
            questionId,
            type: "status",
            to: payload.to,
            ...(payload.auto === true ? { auto: true } : {}),
            ...estimated,
          }
        : null;
    case "note":
      return typeof payload.text === "string"
        ? { questionId, type: "note", text: payload.text }
        : null;
    case "link":
    case "unlink": {
      let target: CompositionKind;
      let ref: PluginRef | undefined;
      if (payload.targetType === "chat-session" && typeof payload.sessionId === "string") {
        target = "chat-session";
        ref = { kind: "chat-session", id: payload.sessionId };
      } else if (payload.targetType === "answer") {
        target = "answer";
        const answer = answerIds.get(Number(payload.targetId));
        ref = answer === undefined ? undefined : { kind: "plugin-entity", id: String(answer) };
      } else {
        const mapped = materialRef(String(payload.targetType), Number(payload.targetId));
        if (!mapped) return null;
        [ref, target] = mapped;
      }
      return {
        questionId,
        type: event.type,
        target,
        ...(ref ? { ref } : {}),
        ...(event.type === "link" && payload.created === true ? { created: true } : {}),
        ...title,
        ...estimated,
      };
    }
    default:
      return null;
  }
}

const assertDatabase = (db: Database.Database, databaseName: unknown) => {
  if (
    typeof databaseName !== "string" ||
    basename(db.name).replace(/\.db$/, "") !== databaseName.replace(/\.db$/, "")
  )
    throw new Error("数据库已切换，请重新打开");
};

/** 渲染端在装好并启用问题插件后调用：pending 判断要不要迁，run 执行 */
export class QuestionMigrationTable {
  static getListenEvents() {
    return {
      "question-migration:pending": this.pending.bind(this),
      "question-migration:run": this.run.bind(this),
    };
  }

  static pending(db: Database.Database, request: { databaseName: string }): boolean {
    assertDatabase(db, request?.databaseName);
    return hasLegacyQuestions(db);
  }

  static run(
    db: Database.Database,
    request: { databaseName: string }
  ): QuestionMigrationResult | null {
    assertDatabase(db, request?.databaseName);
    return migrateQuestionsToPlugin(db);
  }
}
