import { BrowserWindow, ipcMain } from "electron";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { rename } from "node:fs/promises";
import database from "../../src-electron/main/modules/database";
import events from "../../src-electron/main/modules/domain-events";
import CardTable from "../../src-electron/main/modules/tables/card";
import ContentTable from "../../src-electron/main/modules/tables/content";
import { ContentDocumentTable } from "../../src-electron/main/modules/tables/content-document";
import { ContentDocumentBlocks } from "../../src-electron/main/modules/tables/content-document-blocks";
import { getContentLength } from "../../src/utils/helper";
import DataTableTable from "../../src-electron/main/modules/tables/data-table";
import DatabaseItemTable from "../../src-electron/main/modules/tables/database-item";
import TodoGroupTable from "../../src-electron/main/modules/tables/todo-group";
import { TaskAssistantEngine } from "../../src-electron/main/modules/task-assistant/engine";
import { getNextModuleEntityId } from "../../src-electron/main/modules/tables/module-entity-id";
import { queryTasks, queryEvents } from "../../src-electron/main/modules/task-assistant/query";
import { taskKey } from "@tau/shared/task-assistant";
import { QUERY_SOURCES, type QuerySource } from "@tau/shared/query-database";

const marker = "__query_verification__";
function snapshot(db: Database.Database) {
  return db.transaction(() => {
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];
    return Object.fromEntries(
      names.map(({ name }) => {
        const digest = createHash("sha256");
        for (const row of db
          .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
          .safeIntegers(true)
          .iterate() as Iterable<Record<string, unknown>>) {
          digest.update(`row:${Object.keys(row).length}:`);
          for (const [key, value] of Object.entries(row)) {
            const bytes = Buffer.isBuffer(value)
              ? value
              : Buffer.from(
                  typeof value === "bigint" || typeof value === "number"
                    ? String(value)
                    : (JSON.stringify(value) ?? "undefined")
                );
            digest.update(
              `${key.length}:${key}:${Buffer.isBuffer(value) ? "buffer" : typeof value}:${bytes.length}:`
            );
            digest.update(bytes);
          }
        }
        return [name, digest.digest("hex")];
      })
    );
  })();
}

export async function setupFixture(copy: string) {
  const migrations: { tableId: number; ids: string[] }[] = [];
  let originalSources: Record<string, string> | undefined;
  const business = (db: Database.Database) =>
    Object.fromEntries(
      Object.entries(snapshot(db)).filter(([name]) =>
        [
          "cards",
          "articles",
          "project",
          "project_item",
          "diary_entries",
          "diary_segments",
        ].includes(name)
      )
    );
  if (process.env.TAU_QUERY_STRESS_LEGACY === "1") {
    const raw = new Database(join(copy, "data.db"));
    try {
      originalSources = business(raw);
      raw.exec(
        "CREATE TABLE IF NOT EXISTS data_table_sources(table_id INTEGER PRIMARY KEY,kind TEXT,scope TEXT,fields TEXT,create_time INTEGER,update_time INTEGER)"
      );
      const project = raw.prepare("SELECT id FROM project ORDER BY id LIMIT 1").get() as
        | { id: number }
        | undefined;
      const specs: {
        kind: string;
        scope: Record<string, unknown>;
        fields: string[];
        sql: string;
        args?: number[];
      }[] = [
        {
          kind: "card",
          scope: { tags: [] },
          fields: ["title", "tags", "created", "words"],
          sql: "SELECT 'card:'||id AS id FROM cards",
        },
        {
          kind: "article",
          scope: { tags: [] },
          fields: ["title", "author", "created"],
          sql: "SELECT 'article:'||id AS id FROM articles WHERE is_delete=0",
        },
        {
          kind: "diary",
          scope: { range: "all" },
          fields: ["day", "weather", "mood", "words"],
          sql: "SELECT 'diary:'||id AS id FROM diary_entries",
        },
      ];
      if (project)
        for (const deep of [false, true])
          specs.push({
            kind: "document",
            scope: { projectId: project.id, deep },
            fields: ["title", "parent", "updated", "words"],
            sql: deep
              ? `WITH RECURSIVE tree(id) AS (SELECT value FROM project p,json_each(p.children) WHERE p.id=? UNION SELECT c.value FROM tree t JOIN project_item p ON p.id=t.id,json_each(p.children) c) SELECT 'document:'||p.id AS id FROM tree JOIN project_item p ON p.id=tree.id WHERE (p.ref_type IS NULL OR p.ref_type='') AND COALESCE(NULLIF(p.project_item_type,''),'document')='document'`
              : `SELECT 'document:'||p.id AS id FROM project r,json_each(r.children) c JOIN project_item p ON p.id=c.value WHERE r.id=? AND (p.ref_type IS NULL OR p.ref_type='') AND COALESCE(NULLIF(p.project_item_type,''),'document')='document'`,
            args: [project.id],
          });
      for (const spec of specs) {
        const now = Date.now();
        const tableId = Number(
          raw
            .prepare(
              "INSERT INTO data_tables(create_time,update_time,columns,rows,ref_count) VALUES(?,?,?,?,1)"
            )
            .run(
              now,
              now,
              JSON.stringify(
                spec.fields.map(key => ({ id: `src:${key}`, title: key, type: "text" }))
              ),
              JSON.stringify([{ id: "ignored", custom: "ignored" }])
            ).lastInsertRowid
        );
        raw
          .prepare("INSERT INTO data_table_sources VALUES(?,?,?,?,?,?)")
          .run(
            tableId,
            spec.kind,
            JSON.stringify(spec.scope),
            JSON.stringify(spec.fields),
            now,
            now
          );
        raw
          .prepare(
            "INSERT INTO data_table_views(table_id,name,type,config,sort_order,create_time,update_time) VALUES(?,'迁移夹具','table',?,0,?,?)"
          )
          .run(
            tableId,
            JSON.stringify({
              columnOrder: spec.fields.map(key => `src:${key}`),
              sorts: [],
              filters: null,
              groupBy: null,
              rowOrder: [],
            }),
            now,
            now
          );
        migrations.push({
          tableId,
          ids: (raw.prepare(spec.sql).all(...(spec.args ?? [])) as { id: string }[])
            .map(row => row.id)
            .sort(),
        });
      }
    } finally {
      raw.close();
    }
  }
  await database.init();
  await events.init();
  const own = (sender: Electron.WebContents) => {
    const window = BrowserWindow.fromWebContents(sender);
    const name = window && database.windowToDatabase.get(window.id);
    const db = name ? database.getDatabase(name) : undefined;
    if (!name || !db?.open) throw new Error("资料库未连接");
    return { name, db };
  };
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  ipcMain.handle("task-assistant:read", async (event, operation, args, scope) => {
    const { name, db } = own(event.sender);
    if (scope?.databaseName !== name) throw new Error("资料库已切换");
    await database.ensureIndexDatabaseReady(name, "query-stress");
    const index = database.getIndexDatabase(name);
    if (operation === "query_todos") return queryTasks(db, index, name, args);
    if (operation === "query_calendar_events") return queryEvents(db, name, args, index);
    throw new Error("未知只读操作");
  });
  ipcMain.handle("query-stress:info", async event => {
    const { name, db } = own(event.sender);
    await database.ensureIndexDatabaseReady(name, "query-stress-baseline");
    const sources = Object.keys(QUERY_SOURCES) as QuerySource[];
    const expected: Partial<Record<QuerySource, string[]>> = {};
    const spec: [QuerySource, string, string][] = [
      ["cards", "SELECT id FROM cards", "card:"],
      ["articles", "SELECT id FROM articles WHERE is_delete=0", "article:"],
      ["projects", "SELECT id FROM project", "project:"],
      [
        "documents",
        "SELECT id FROM project_item WHERE ref_type IS NULL OR ref_type=''",
        "document:",
      ],
      ["whiteboards", "SELECT id FROM white_boards", "whiteboard:"],
      ["diary", "SELECT id FROM diary_entries", "diary:"],
      ["notebooks", "SELECT id FROM vibe_learning_project", ""],
      [
        "chats",
        "SELECT id FROM chat_session WHERE scope IN ('main-chat','pdf-chat','video-note-chat','vibe-learning-chat')",
        "",
      ],
      [
        "materials",
        "SELECT 'excerpt:'||id AS id FROM excerpt WHERE is_deleted=0 UNION ALL SELECT 'pdf-annotation:'||a.id FROM pdf_annotations a JOIN pdfs p ON p.id=a.pdf_id UNION ALL SELECT 'web-clip:'||id FROM web_clip",
        "",
      ],
    ];
    for (const [source, sql, prefix] of spec)
      expected[source] = (db.prepare(sql).all() as { id: string | number }[])
        .map(row => prefix + row.id)
        .sort();
    const tables = (
      db
        .prepare(
          "SELECT id,columns,rows FROM data_tables t WHERE ref_count>0 AND NOT EXISTS(SELECT 1 FROM data_table_queries q WHERE q.table_id=t.id) ORDER BY id"
        )
        .all() as { id: number; columns: string; rows: string }[]
    ).map(table => ({
      id: table.id,
      columns: (JSON.parse(table.columns) as { id: string }[]).map(column => column.id),
      ids: (JSON.parse(table.rows) as { id: string }[]).map(row => String(row.id)).sort(),
    }));
    const content = db
      .prepare(
        "SELECT c.id AS contentId,c.create_time AS createdAt FROM contents c JOIN cards a ON a.content_id=c.id ORDER BY c.id LIMIT 1"
      )
      .get();
    return {
      sources,
      expected,
      tables,
      content,
      marker,
      bulkSize: Number(process.env.TAU_QUERY_STRESS_BULK ?? 2000),
      ...(migrations.length
        ? {
            migrations,
            migrationSourceUnchanged:
              JSON.stringify(business(db)) === JSON.stringify(originalSources),
          }
        : {}),
      projectDocumentCounts: db
        .prepare(`
        SELECT 'project:'||p.id AS id,COUNT(d.id) AS count FROM project p
        LEFT JOIN project_item d ON (d.ref_type IS NULL OR d.ref_type='')
          AND EXISTS (SELECT 1 FROM json_each(d.projects) j
            WHERE j.type IN ('integer','real') AND j.value=p.id)
        GROUP BY p.id ORDER BY p.id
      `)
        .all(),
      pinnedGroups: db
        .prepare(`
        SELECT CASE WHEN is_top THEN 1 ELSE 0 END AS pinned,COUNT(*) AS count
        FROM cards GROUP BY CASE WHEN is_top THEN 1 ELSE 0 END ORDER BY pinned
      `)
        .all(),
      baseline: snapshot(db),
    };
  });
  ipcMain.handle("query-stress:inspect", event => {
    const { db } = own(event.sender);
    return {
      snapshot: snapshot(db),
      quickCheck: db.pragma("quick_check", { simple: true }),
      foreignKeys: (db.pragma("foreign_key_check") as unknown[]).length,
      cards: db.prepare("SELECT count(*) n FROM cards").get(),
    };
  });
  let fixtureCard: { id: number; contentId?: number } | undefined;
  const bulkIds: number[] = [];
  ipcMain.handle("query-stress:mutate", (_event, operation, input) => {
    const db = database.getDatabase("data.db");
    if (!db?.open) throw new Error("测试库已关闭");
    if (operation === "create") {
      fixtureCard = CardTable.createCard(db, {
        content: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "query verification fixture" }],
          },
        ],
        tags: [marker],
        isTop: false,
        count: 0,
      });
      return { id: fixtureCard.id, contentId: fixtureCard.contentId };
    }
    if (!fixtureCard) throw new Error("夹具尚未创建");
    if (operation === "tags") {
      CardTable.patchScopedCard(db, {
        databaseName: "data.db",
        id: fixtureCard.id,
        patch: {
          tags: input === "child" ? [marker + "/child"] : input ? [marker] : [marker + "-outside"],
        },
      });
      return true;
    }
    if (operation === "body") {
      if (!fixtureCard.contentId) throw new Error("卡片正文不存在");
      ContentTable.updateContent(db, fixtureCard.contentId, {
        content: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "query verification changed body" }],
          },
        ],
      });
      return true;
    }
    if (operation === "delete") {
      CardTable.deleteCard(db, fixtureCard.id);
      return true;
    }
    if (operation === "bulk") {
      const started = performance.now();
      const size = Number(input);
      db.transaction(() => {
        for (let index = 0; index < size; index++)
          bulkIds.push(
            CardTable.createCard(db, { content: [], tags: [marker], isTop: false, count: 0 }).id
          );
      })();
      return { rows: size, writeMs: Math.round(performance.now() - started) };
    }
    if (operation === "bulk-out") {
      const ids = bulkIds.slice(0, Number(input));
      db.transaction(() => {
        for (const id of ids)
          CardTable.patchScopedCard(db, {
            databaseName: "data.db",
            id,
            patch: { tags: [marker + "-outside"] },
          });
      })();
      return ids.length;
    }
    if (operation === "rollback") {
      const before = snapshot(db);
      const targetId = bulkIds[0] ?? fixtureCard.id;
      try {
        db.transaction(() => {
          CardTable.createCard(db, { content: [], tags: [marker], isTop: false, count: 0 });
          CardTable.patchScopedCard(db, {
            databaseName: "data.db",
            id: targetId,
            patch: { tags: [marker + "-rollback"] },
          });
          throw new Error("intentional rollback");
        })();
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "intentional rollback") throw error;
      }
      return JSON.stringify(before) === JSON.stringify(snapshot(db));
    }
    throw new Error("未知变更");
  });
  ipcMain.handle("query-stress:query-table", event => {
    const { db } = own(event.sender);
    return DatabaseItemTable.create(db, {
      title: marker,
      query: { version: 1, language: "dsl", code: "TABLE title FROM cards" },
    }).dataTableId;
  });
  ipcMain.handle("query-stress:large-table", (event, size: number) => {
    const { db } = own(event.sender);
    if (!Number.isInteger(size) || size < 0 || size > 60_000) throw new Error("夹具规模无效");
    const item = DatabaseItemTable.create(db, { title: marker + ":table" });
    DataTableTable.update(db, {
      id: item.dataTableId,
      columns: [{ id: "value", title: "数值", type: "number" }],
      rows: Array.from({ length: size }, (_, index) => ({ id: `stress:${index}`, value: index })),
    });
    return item.dataTableId;
  });
  ipcMain.handle("query-stress:large-payload", event => {
    const { db } = own(event.sender);
    const item = DatabaseItemTable.create(db, { title: marker + ":payload" });
    DataTableTable.update(db, {
      id: item.dataTableId,
      columns: [{ id: "value", title: "长文本", type: "text" }],
      rows: [{ id: "payload", value: "x".repeat(17_000_000) }],
    });
    return item.dataTableId;
  });
  ipcMain.handle("query-stress:seed-more", event => {
    const { db } = own(event.sender);
    const now = Date.now();
    const notebookId = getNextModuleEntityId(db);
    db.prepare(
      "INSERT INTO vibe_learning_project(id,create_time,update_time,title,desc,archived,pinned) VALUES(?,?,?,?,?,0,0)"
    ).run(notebookId, now, now, marker, "[]");
    const group = TodoGroupTable.createGroup(db, { title: marker });
    if (!group) throw new Error("无法创建待办夹具");
    const engine = new TaskAssistantEngine(db);
    for (let index = 0; index < 3; index++)
      engine.execute(
        "create_todo",
        { requestId: `query-stress-${index}`, title: marker + index, groupId: group.id },
        "data.db"
      );
    engine.execute(
      "create_todo",
      {
        requestId: "query-stress-repeat",
        title: marker + ":repeat",
        groupId: group.id,
        recurrence: { type: "daily", interval: 1, startDate: "2026-11-01" },
      },
      "data.db"
    );
    return { notebookId: String(notebookId), groupId: group.id };
  });
  ipcMain.handle("query-stress:close", event => {
    const { db } = own(event.sender);
    db.close();
    return true;
  });
  ipcMain.handle("query-stress:create-other", () => {
    const db = new Database(join(copy, "other.db"));
    db.close();
    return true;
  });
  ipcMain.handle("query-stress:todo-ids", event => {
    const { name, db } = own(event.sender);
    return queryTasks(db, database.getIndexDatabase(name), name, {
      source: "todo",
      pageSize: 100,
    }).items.map(task => taskKey(task.taskRef));
  });
  ipcMain.handle("query-stress:replace", async event => {
    const { name, db } = own(event.sender);
    const before = {
      quickCheck: db.pragma("quick_check", { simple: true }),
      foreignKeys: (db.pragma("foreign_key_check") as unknown[]).length,
    };
    const source = database.getDatabase("other.db");
    if (!source?.open) throw new Error("替换夹具未就绪");
    const temporary = join(copy, "replacement.db");
    await source.backup(temporary);
    await database.closeForSync(name, true);
    await rename(temporary, join(copy, name));
    return before;
  });
  const liveSpecs: Record<string, { table: string; id: number | string }> = {};
  ipcMain.handle("query-stress:live-samples", event => {
    const { db, name } = own(event.sender);
    const specs: [string, string, string][] = [
      ["articles", "SELECT id FROM articles WHERE is_delete=0 LIMIT 1", "article:"],
      [
        "documents",
        "SELECT id FROM project_item WHERE ref_type IS NULL OR ref_type='' LIMIT 1",
        "document:",
      ],
      ["projects", "SELECT id FROM project LIMIT 1", "project:"],
      ["whiteboards", "SELECT id FROM white_boards LIMIT 1", "whiteboard:"],
      ["notebooks", "SELECT id FROM vibe_learning_project LIMIT 1", ""],
      ["materials", "SELECT id FROM web_clip LIMIT 1", "web-clip:"],
      ["chats", "SELECT id FROM chat_session WHERE scope='main-chat' LIMIT 1", ""],
      [
        "calendar",
        "SELECT e.id,e.create_time FROM calendar_event e JOIN calendar c ON c.id=e.calendar_id WHERE e.todo_item_id IS NULL AND NOT EXISTS(SELECT 1 FROM todo_calendar_mapping m WHERE m.calendar_event_id=e.id) LIMIT 1",
        "",
      ],
    ];
    const tables: Record<string, string> = {
      articles: "articles",
      documents: "project_item",
      projects: "project",
      whiteboards: "white_boards",
      notebooks: "vibe_learning_project",
      materials: "web_clip",
      chats: "chat_session",
      calendar: "calendar_event",
    };
    const samples: {
      source: string;
      id: string;
      params?: Record<string, unknown>;
      diarySegmentId?: number;
    }[] = [];
    for (const [source, sql, prefix] of specs) {
      const row = db.prepare(sql).get() as
        | { id: number | string; create_time?: number }
        | undefined;
      if (!row) continue;
      liveSpecs[source] = { table: tables[source], id: row.id };
      samples.push({
        source,
        id: source === "calendar" ? `${row.id}:${row.create_time}` : prefix + row.id,
        ...(source === "calendar" ? { params: { view: "stored" } } : {}),
      });
    }
    const task = queryTasks(db, database.getIndexDatabase(name), name, {
      source: "todo",
      pageSize: 1,
    }).items[0];
    if (task?.taskRef.kind === "todo") {
      liveSpecs.todos = { table: "todo_item", id: task.taskRef.todoId };
      samples.push({ source: "todos", id: taskKey(task.taskRef), params: { source: "todo" } });
    }
    const diary = db.prepare("SELECT id,diary_id FROM diary_segments LIMIT 1").get() as
      | { id: number; diary_id: number }
      | undefined;
    if (diary)
      samples.push({ source: "diary", id: `diary:${diary.diary_id}`, diarySegmentId: diary.id });
    return samples;
  });
  ipcMain.handle(
    "query-stress:mutate-source",
    (_event, source: string, target: string, separate = false) => {
      const db = database.getDatabase("data.db");
      const spec = liveSpecs[source];
      if (!db || !spec) throw new Error("来源夹具不存在");
      const connection = separate ? new Database(db.name) : db;
      try {
        connection
          .prepare(`UPDATE ${spec.table} SET title=?,update_time=? WHERE id=?`)
          .run(target, Date.now(), spec.id);
      } finally {
        if (separate) connection.close();
      }
      return true;
    }
  );
  ipcMain.handle("query-stress:diary-body", event => {
    const { db } = own(event.sender);
    const segment = db
      .prepare("SELECT id,diary_id,content_id FROM diary_segments LIMIT 1")
      .get() as { id: number; diary_id: number; content_id: number } | undefined;
    if (!segment) throw new Error("日记夹具不存在");
    const content = ContentTable.getContentById(db, segment.content_id);
    if (!content) throw new Error("日记正文不存在");
    const modified = structuredClone(content.content);
    const append = (nodes: unknown[]): boolean => {
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const value = node as { text?: string; children?: unknown[] };
        if (typeof value.text === "string") {
          value.text += marker + " appended verification words";
          return true;
        }
        if (value.children && append(value.children)) return true;
      }
      return false;
    };
    if (!append(modified)) throw new Error("日记夹具没有可编辑文本");
    return {
      segmentId: segment.id,
      contentId: segment.content_id,
      revision: content.revision,
      contracts: content.contracts,
      diaryId: segment.diary_id,
      content: modified,
    };
  });
  ipcMain.handle("query-stress:diary-projected-body", (event, contentId, content, revision) => {
    const { db } = own(event.sender);
    const stored = ContentDocumentTable.read(db, contentId);
    if (!stored) throw new Error("日记正文缺少文档身份");
    ContentDocumentBlocks.commit(db, contentId, {
      documentId: stored.documentId,
      expectedRevision: revision,
      contracts: stored.contracts,
      blocks: content,
      count: nodes => getContentLength(nodes as import("slate").Descendant[]),
      countRules: "query-verification",
    });
  });
}
