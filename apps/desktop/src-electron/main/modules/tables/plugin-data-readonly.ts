import Database from "better-sqlite3";
import { basename } from "node:path";
import type {
  PluginChatSession,
  PluginEntityRef,
  PluginMaterial,
  PluginMaterialKind,
  PluginNotebook,
  PluginNotebookResource,
} from "@tau/plugins";
import type { MaterialRef } from "@/entity/material";
import type {
  PluginDataQuery,
  PluginDataScope,
  PluginReadonlyEntity,
  PluginReadonlyPage,
  PluginReadonlyRecord,
} from "@/types/plugin-data";
import type { MaterialSourceMeta, NoteSourceMeta, RemoteSourceMeta } from "@/types/vibe-learning";
import MaterialTable from "./material";
import { readPageQuery, toPage } from "./plugin-data-page";

interface PageRow {
  key: string | number;
  created: number;
  updated: number;
}

interface NotebookRow extends PageRow {
  key: number;
  title: string;
  archived: number;
  pinned: number;
  resource_count: number;
}

interface MaterialRow extends PageRow {
  key: string;
  id: number;
  url: string | null;
}

interface ChatRow extends PageRow {
  key: string;
  title: string;
  scope: string;
  message_count: number;
  archived: number;
}

interface ResourceRow {
  id: number;
  name: string;
  resource_type: string;
  source_type: string | null;
  source_meta_info: string | null;
  file_size: number | null;
  duration: number | null;
  create_time: number;
}

const MATERIAL_SQL: Record<PluginMaterialKind, string> = {
  excerpt: `SELECT 'excerpt:' || id AS key, id, create_time AS created, update_time AS updated, url
    FROM excerpt WHERE is_deleted = 0`,
  // 与 material:resolve 一致：所在 PDF 已删除的标注不再可见
  "pdf-annotation": `SELECT 'pdf-annotation:' || a.id AS key, a.id, a.create_time AS created,
      a.update_time AS updated, NULL AS url
    FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id`,
  "web-clip": `SELECT 'web-clip:' || id AS key, id, create_time AS created,
      update_time AS updated, url FROM web_clip`,
};

const CHAT_SCENES: Record<string, PluginChatSession["scene"]> = {
  "main-chat": "main",
  "pdf-chat": "pdf",
  "video-note-chat": "video-note",
  "vibe-learning-chat": "notebook",
};

/** 对插件可见的对话范围，供 SQL IN 子句使用（只读接口与业务事件共用） */
export const PLUGIN_CHAT_SCOPES_SQL = Object.keys(CHAT_SCENES)
  .map(scope => `'${scope}'`)
  .join(", ");

const NOTE_KINDS: Record<string, PluginEntityRef["kind"]> = {
  card: "card",
  article: "article",
  "project-item": "document",
  "diary-moment": "diary",
  "plugin-entity": "plugin-entity",
};

interface Spec<Row extends PageRow> {
  sql: string;
  numericKey: boolean;
  records(db: Database.Database, rows: Row[]): PluginReadonlyRecord[];
}

const notebookSpec: Spec<NotebookRow> = {
  sql: `SELECT v.id AS key, v.create_time AS created, v.update_time AS updated, v.title,
      v.archived, v.pinned,
      (SELECT COUNT(*) FROM vibe_learning_resources r WHERE r.project_id = v.id) AS resource_count
    FROM vibe_learning_project v`,
  numericKey: true,
  records: (_db, rows) =>
    rows.map((row): PluginNotebook => ({
      id: String(row.key),
      title: row.title,
      archived: Boolean(row.archived),
      pinned: Boolean(row.pinned),
      resourceCount: row.resource_count,
      createdAt: row.created,
      updatedAt: row.updated,
    })),
};

const materialSpec: Spec<MaterialRow> = {
  sql: Object.values(MATERIAL_SQL).join("\nUNION ALL\n"),
  numericKey: false,
  records(db, rows) {
    const refs = rows.map(row => {
      const [kind] = row.key.split(":");
      return { kind, id: row.id } as MaterialRef;
    });
    const infos = new Map(
      MaterialTable.resolve(db, refs).map(info => [`${info.ref.kind}:${info.ref.id}`, info])
    );
    return rows.flatMap((row): PluginMaterial[] => {
      const info = infos.get(row.key);
      if (!info) return [];
      return [
        {
          id: row.key,
          kind: info.ref.kind,
          title: info.title,
          quote: info.quote,
          note: info.note,
          source: info.meta,
          ...(row.url ? { url: row.url } : {}),
          createdAt: row.created,
          updatedAt: row.updated,
        },
      ];
    });
  },
};

const chatSpec: Spec<ChatRow> = {
  sql: `SELECT id AS key, create_time AS created, update_time AS updated, title, scope,
      message_count, archived
    FROM chat_session WHERE scope IN (${PLUGIN_CHAT_SCOPES_SQL})`,
  numericKey: false,
  records: (_db, rows) =>
    rows.map((row): PluginChatSession => ({
      id: row.key,
      title: row.title,
      scene: CHAT_SCENES[row.scope],
      messageCount: row.message_count,
      archived: Boolean(row.archived),
      createdAt: row.created,
      updatedAt: row.updated,
    })),
};

const SPECS: Record<PluginReadonlyEntity, Spec<never>> = {
  notebook: notebookSpec as Spec<never>,
  material: materialSpec as Spec<never>,
  "chat-session": chatSpec as Spec<never>,
};

function parseMeta<T>(raw: string | null): Partial<T> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** 资料的来源：宿主自有来源之外的 source_type 是在线视频提供方插件 ID */
function resourceSource(
  sourceType: string | null,
  meta: string | null
): Pick<PluginNotebookResource, "source" | "url" | "from"> {
  switch (sourceType ?? "local") {
    case "local":
      return { source: "local" };
    case "remote": {
      const { url } = parseMeta<RemoteSourceMeta>(meta);
      return { source: "remote", ...(typeof url === "string" && url ? { url } : {}) };
    }
    case "note": {
      const { type, originalId } = parseMeta<NoteSourceMeta>(meta);
      const kind = typeof type === "string" ? NOTE_KINDS[type] : undefined;
      return {
        source: "note",
        ...(kind && Number.isSafeInteger(originalId)
          ? { from: [{ kind, id: String(originalId) }] }
          : {}),
      };
    }
    case "material": {
      const { refs } = parseMeta<MaterialSourceMeta>(meta);
      const from = (Array.isArray(refs) ? refs : []).flatMap((ref): PluginEntityRef[] =>
        ref && typeof ref.kind === "string" && Number.isSafeInteger(ref.id)
          ? [{ kind: "material", id: `${ref.kind}:${ref.id}` }]
          : []
      );
      return { source: "material", ...(from.length ? { from } : {}) };
    }
    default:
      return { source: "online-video" };
  }
}

/**
 * 插件对 Notebook、材料与对话的只读访问：Notebook 只给信息与资料清单（不含文件路径与转换后的文字），
 * 材料给标题、原文、想法与出处，对话只给信息、不含消息。权限在渲染端宿主校验。
 */
export default class PluginReadonlyDataTable {
  static getListenEvents() {
    return {
      "plugin-data:readonly-query": this.query.bind(this),
      "plugin-data:readonly-get": this.get.bind(this),
      "plugin-data:notebook-resources": this.notebookResources.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, scope: PluginDataScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  private static spec(entity: unknown): Spec<PageRow> {
    if (typeof entity !== "string" || !Object.hasOwn(SPECS, entity))
      throw new Error("未知的数据类型");
    return SPECS[entity as PluginReadonlyEntity] as Spec<PageRow>;
  }

  static query(
    db: Database.Database,
    request: PluginDataScope & { entity: PluginReadonlyEntity; query: PluginDataQuery }
  ): PluginReadonlyPage {
    this.assertDatabase(db, request);
    const spec = this.spec(request.entity);
    if (request.query.tag !== undefined) throw new Error("这类内容没有标签，不能按 tag 查询");
    const { sort, limit, where, params } = readPageQuery(request.query, {
      column: "key",
      numeric: spec.numericKey,
    });
    const rows = db
      .prepare(
        `SELECT * FROM (${spec.sql})
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY ${sort} DESC, key DESC LIMIT ?`
      )
      .all(...params, limit + 1) as PageRow[];
    const page = toPage(rows, limit, sort, row => row.key);
    return {
      items: spec.records(db, page.rows),
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  static get(
    db: Database.Database,
    request: PluginDataScope & { entity: PluginReadonlyEntity; id: string }
  ): PluginReadonlyRecord | null {
    this.assertDatabase(db, request);
    const spec = this.spec(request.entity);
    if (typeof request.id !== "string") return null;
    const row = (
      request.entity === "material"
        ? this.materialRow(db, request.id)
        : spec.numericKey && !/^\d+$/.test(request.id)
          ? undefined
          : db
              .prepare(`SELECT * FROM (${spec.sql}) WHERE key = ?`)
              .get(spec.numericKey ? Number(request.id) : request.id)
    ) as PageRow | undefined;
    return row ? (spec.records(db, [row])[0] ?? null) : null;
  }

  /** 按类型直接查对应的表，不经三表合并 */
  private static materialRow(db: Database.Database, id: string) {
    const match = /^([a-z-]+):(\d+)$/.exec(id);
    if (!match || !Object.hasOwn(MATERIAL_SQL, match[1])) return undefined;
    return db
      .prepare(`SELECT * FROM (${MATERIAL_SQL[match[1] as PluginMaterialKind]}) WHERE id = ?`)
      .get(Number(match[2]));
  }

  /** Notebook 的资料清单，按 Notebook 中的顺序；Notebook 不存在时为 null */
  static notebookResources(
    db: Database.Database,
    request: PluginDataScope & { notebookId: number }
  ): PluginNotebookResource[] | null {
    this.assertDatabase(db, request);
    if (!Number.isSafeInteger(request.notebookId)) return null;
    if (!db.prepare("SELECT 1 FROM vibe_learning_project WHERE id = ?").get(request.notebookId))
      return null;
    // 只取清单字段：转录字幕等大字段不读
    const rows = db
      .prepare(
        `SELECT id, name, resource_type, source_type, source_meta_info, file_size, duration,
           create_time
         FROM vibe_learning_resources WHERE project_id = ?
         ORDER BY sort_index ASC, create_time DESC, id DESC`
      )
      .all(request.notebookId) as ResourceRow[];
    return rows.map(row => ({
      id: String(row.id),
      name: row.name,
      type: row.resource_type,
      ...resourceSource(row.source_type, row.source_meta_info),
      size: row.file_size ?? null,
      duration: row.duration ?? null,
      createdAt: row.create_time,
    }));
  }
}
