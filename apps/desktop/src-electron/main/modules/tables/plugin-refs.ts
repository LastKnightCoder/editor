import Database from "better-sqlite3";
import { basename } from "node:path";
import type { EntityKind } from "@/types";
import type { MaterialRef } from "@/entity/material";
import type { PluginDataScope, PluginRefDescription, PluginRefInput } from "@/types/plugin-data";
import type { NotebookPlan } from "@/types/vibe-learning";
import { readDocumentTask } from "../task-assistant/documents";
import EntitySearchTable from "./entity-search";
import MaterialTable from "./material";

const MAX_REFS = 200;

/** 以数字 ID 寻址的插件引用类型：所在表、附加条件与标题解析用的检索类型 */
const NUMERIC_KINDS: Record<string, { sql: string; search: EntityKind }> = {
  card: { sql: "SELECT create_time FROM cards WHERE id = ?", search: "card" },
  article: {
    sql: "SELECT create_time FROM articles WHERE id = ? AND is_delete = 0",
    search: "article",
  },
  document: { sql: "SELECT create_time FROM project_item WHERE id = ?", search: "project_item" },
  diary: { sql: "SELECT create_time FROM diary_segments WHERE id = ?", search: "diary-moment" },
  whiteboard: { sql: "SELECT create_time FROM white_boards WHERE id = ?", search: "white_board" },
  project: { sql: "SELECT create_time FROM project WHERE id = ?", search: "project" },
  notebook: {
    sql: "SELECT create_time FROM vibe_learning_project WHERE id = ?",
    search: "notebook",
  },
  "plugin-entity": {
    sql: "SELECT create_time FROM plugin_entities WHERE id = ?",
    search: "plugin-entity",
  },
};

/** 材料的存在判断：软删除的划线视为不存在 */
const MATERIAL_SQL: Record<string, string> = {
  excerpt: "SELECT create_time FROM excerpt WHERE id = ? AND is_deleted = 0",
  "pdf-annotation": "SELECT create_time FROM pdf_annotations WHERE id = ?",
  "web-clip": "SELECT create_time FROM web_clip WHERE id = ?",
};

/** 可作为 Notebook 笔记资源的类型：正文所在的表、标题检索类型与资源元数据里的来源类型 */
const NOTE_SOURCES: Record<string, { sql: string; search: EntityKind; noteType: string }> = {
  card: { sql: "SELECT content_id FROM cards WHERE id = ?", search: "card", noteType: "card" },
  article: {
    sql: "SELECT content_id FROM articles WHERE id = ? AND is_delete = 0",
    search: "article",
    noteType: "article",
  },
  // 引用卡片 / 文章的条目正文归被引用的内容，不按项目文档带入
  document: {
    sql: "SELECT content_id FROM project_item WHERE id = ? AND (ref_type IS NULL OR ref_type = '')",
    search: "project_item",
    noteType: "project-item",
  },
  diary: {
    sql: "SELECT content_id FROM diary_segments WHERE id = ?",
    search: "diary-moment",
    noteType: "diary-moment",
  },
  "plugin-entity": {
    sql: "SELECT content_id FROM plugin_entities WHERE id = ?",
    search: "plugin-entity",
    noteType: "plugin-entity",
  },
};

interface Located {
  /** 目标的创建时间：授权按它核对，编号被复用时不会落到新内容上 */
  createdAt: number;
  title(): string;
}

const numericId = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

/**
 * 插件引用的统一寻址：ID 格式与 context.data 一致——待办为 `todo:ID:创建时间` 或
 * `document:正文ID:创建时间:taskId`（可带 `@日期`），日程为 `ID:创建时间`，材料为 `类型:ID`，
 * 对话为会话 ID，其余为数字 ID。只读主库，不返回正文。
 */
function locate(db: Database.Database, kind: string, id: string): Located | null {
  const createdAt = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { create_time: number } | undefined)?.create_time;
  const resolved = (search: EntityKind, entityId: number) => () =>
    EntitySearchTable.resolve(db, search, entityId, 0)?.title ?? "";
  const numeric = NUMERIC_KINDS[kind];
  if (numeric) {
    const entityId = numericId(id);
    const time = entityId === null ? undefined : createdAt(numeric.sql, entityId);
    return time === undefined
      ? null
      : { createdAt: time, title: resolved(numeric.search, entityId!) };
  }
  switch (kind) {
    case "todo": {
      const key = id.split("@")[0];
      const todo = /^todo:(\d+):(\d+)$/.exec(key);
      if (todo) {
        const time = createdAt(
          "SELECT create_time FROM todo_item WHERE id = ? AND create_time = ?",
          Number(todo[1]),
          Number(todo[2])
        );
        return time === undefined
          ? null
          : { createdAt: time, title: resolved("todo", Number(todo[1])) };
      }
      const task = /^document:(\d+):(\d+):(.+)$/.exec(key);
      if (!task) return null;
      const ref = {
        kind: "document" as const,
        contentId: Number(task[1]),
        createdAt: Number(task[2]),
        taskId: task[3],
      };
      const time = createdAt(
        "SELECT create_time FROM contents WHERE id = ? AND create_time = ?",
        ref.contentId,
        ref.createdAt
      );
      if (time === undefined) return null;
      return {
        createdAt: time,
        title: () => {
          try {
            return readDocumentTask(db, ref).title;
          } catch {
            return "";
          }
        },
      };
    }
    case "event": {
      const event = /^(\d+):(\d+)$/.exec(id.split("@")[0]);
      if (!event) return null;
      const time = createdAt(
        "SELECT create_time FROM calendar_event WHERE id = ? AND create_time = ?",
        Number(event[1]),
        Number(event[2])
      );
      return time === undefined
        ? null
        : { createdAt: time, title: resolved("calendar-event", Number(event[1])) };
    }
    case "material": {
      const match = /^([a-z-]+):(\d+)$/.exec(id);
      if (!match || !Object.hasOwn(MATERIAL_SQL, match[1])) return null;
      const ref = { kind: match[1] as "excerpt", id: Number(match[2]) };
      const time = createdAt(MATERIAL_SQL[ref.kind], ref.id);
      return time === undefined
        ? null
        : { createdAt: time, title: () => MaterialTable.resolve(db, [ref])[0]?.title ?? "" };
    }
    case "chat-session": {
      const row = db.prepare("SELECT create_time, title FROM chat_session WHERE id = ?").get(id) as
        { create_time: number; title: string } | undefined;
      return row ? { createdAt: row.create_time, title: () => row.title || "新对话" } : null;
    }
    default:
      return null;
  }
}

/** 插件引用的存在判断、用户选择过的引用的登记与标题描述（context.app.open / pick / describe） */
export default class PluginRefsTable {
  static getListenEvents() {
    return {
      "plugin-refs:exists": this.exists.bind(this),
      "plugin-refs:grant": this.grant.bind(this),
      "plugin-refs:describe": this.describe.bind(this),
      "plugin-refs:clear": this.clear.bind(this),
      "plugin-refs:notebook-plan": this.notebookPlan.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, scope: PluginDataScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  private static readRefs(refs: unknown): PluginRefInput[] {
    if (!Array.isArray(refs) || refs.length > MAX_REFS) throw new Error("引用列表无效");
    return refs.map(ref => {
      const { kind, id } = (ref ?? {}) as Partial<PluginRefInput>;
      if (typeof kind !== "string" || typeof id !== "string" || !id || id.length > 200)
        throw new Error("引用无效");
      return { kind, id };
    });
  }

  /** 插件打开引用前确认目标仍在；只回答是否存在，不返回任何内容 */
  static exists(db: Database.Database, request: PluginDataScope & PluginRefInput): boolean {
    this.assertDatabase(db, request);
    return locate(db, request.kind, request.id) !== null;
  }

  /** 登记用户在选择窗口中选中的引用；不存在的忽略，重复选择更新为目标当前的创建时间 */
  static grant(
    db: Database.Database,
    request: PluginDataScope & { pluginId: string; refs: PluginRefInput[] }
  ): number {
    this.assertDatabase(db, request);
    if (typeof request.pluginId !== "string" || !request.pluginId) throw new Error("插件 ID 无效");
    const insert = db.prepare(
      `INSERT INTO plugin_ref_grants (plugin_id, kind, ref_id, target_created_at, create_time)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (plugin_id, kind, ref_id) DO UPDATE SET target_created_at = excluded.target_created_at`
    );
    const now = Date.now();
    let granted = 0;
    for (const ref of this.readRefs(request.refs)) {
      const located = locate(db, ref.kind, ref.id);
      if (located)
        granted += insert.run(request.pluginId, ref.kind, ref.id, located.createdAt, now).changes;
    }
    return granted;
  }

  /**
   * 按顺序描述引用：插件已获准读取的类型（readable）、用户选择过的引用与本插件自己的内容给出标题，
   * 其余为 denied 且不透露是否存在。选择过的内容已删除、编号被复用时为 missing。
   */
  static describe(
    db: Database.Database,
    request: PluginDataScope & { pluginId: string; refs: PluginRefInput[]; readable: string[] }
  ): PluginRefDescription[] {
    this.assertDatabase(db, request);
    const readable = new Set(Array.isArray(request.readable) ? request.readable : []);
    const grantOf = db.prepare(
      "SELECT target_created_at FROM plugin_ref_grants WHERE plugin_id = ? AND kind = ? AND ref_id = ?"
    );
    const ownEntity = db.prepare("SELECT 1 FROM plugin_entities WHERE id = ? AND plugin_id = ?");
    return this.readRefs(request.refs).map((ref): PluginRefDescription => {
      const own =
        ref.kind === "plugin-entity" &&
        numericId(ref.id) !== null &&
        Boolean(ownEntity.get(numericId(ref.id), request.pluginId));
      const grant = grantOf.get(request.pluginId, ref.kind, ref.id) as
        { target_created_at: number } | undefined;
      const allowed = readable.has(ref.kind) || own;
      if (!allowed && !grant) return { status: "denied" };
      const located = locate(db, ref.kind, ref.id);
      if (!located || (!allowed && grant!.target_created_at !== located.createdAt))
        return { status: "missing" };
      return { status: "ok", title: located.title() };
    });
  }

  /**
   * 插件 notebook.create 的资料计划：有正文的内容转为笔记资源，划线与 PDF 标注合并、剪藏各一份；
   * 其余类型与已删除的计入 skipped。只在宿主确认框中展示，不交给插件。
   */
  static notebookPlan(
    db: Database.Database,
    request: PluginDataScope & { refs: PluginRefInput[] }
  ): NotebookPlan {
    this.assertDatabase(db, request);
    const plan: NotebookPlan = { notes: [], excerpts: [], clips: [], skipped: 0 };
    const seen = new Set<string>();
    for (const ref of this.readRefs(request.refs)) {
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const note = NOTE_SOURCES[ref.kind];
      const entityId = numericId(ref.id);
      if (note && entityId !== null) {
        const row = db.prepare(note.sql).get(entityId) as { content_id: number } | undefined;
        if (row?.content_id) {
          plan.notes.push({
            contentId: row.content_id,
            title: EntitySearchTable.resolve(db, note.search, entityId, 0)?.title ?? "",
            noteType: note.noteType,
            originalId: entityId,
          });
          continue;
        }
      } else if (ref.kind === "material") {
        const match = /^([a-z-]+):(\d+)$/.exec(ref.id);
        const material =
          match && Object.hasOwn(MATERIAL_SQL, match[1])
            ? ({ kind: match[1], id: Number(match[2]) } as MaterialRef)
            : null;
        const info = material ? MaterialTable.resolveOne(db, material) : null;
        if (material && info && !info.deleted) {
          if (material.kind === "web-clip") plan.clips.push({ ref: material, title: info.title });
          else plan.excerpts.push(material);
          continue;
        }
      }
      plan.skipped += 1;
    }
    return plan;
  }

  /** 卸载插件并选择清除数据时，删除它在当前库登记的选择 */
  static clear(db: Database.Database, request: PluginDataScope & { pluginId: string }): number {
    this.assertDatabase(db, request);
    return db.prepare("DELETE FROM plugin_ref_grants WHERE plugin_id = ?").run(request.pluginId)
      .changes;
  }
}
