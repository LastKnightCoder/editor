import Database from "better-sqlite3";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  connected: [] as Array<(dbName: string, reason: string) => void>,
  db: undefined as unknown,
  send: vi.fn(),
}));
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: hoisted.send } }],
  },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("electron-log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../database", () => ({
  default: {
    onDatabaseConnected: (callback: (dbName: string, reason: string) => void) =>
      hoisted.connected.push(callback),
    getDatabase: () => hoisted.db,
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import { broadcastDatabaseChange } from "../database-notifications";
import domainEvents from "../domain-events";

const doc = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as never;

describe("业务数据变更事件", () => {
  let db: Database.Database;
  const events = () =>
    hoisted.send.mock.calls
      .filter(([channel]) => channel === "domain-events")
      .flatMap(([, message]) =>
        message.events.map(({ type, id }: { type: string; id?: number }) => ({ type, id }))
      );
  const card = (contentId: number) =>
    Number(
      db
        .prepare(
          "INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)"
        )
        .run(contentId).lastInsertRowid
    );

  beforeAll(() => domainEvents.init());
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.send.mockClear();
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    hoisted.db = db;
    for (const callback of hoisted.connected) callback("alpha.db", "connect");
  });
  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it("合并窗口内的增改为一次新建；正文修改计入所属卡片", async () => {
    const contentId = ContentTable.createContent(db, { content: doc("甲") });
    const id = card(contentId);
    db.prepare("UPDATE cards SET is_top = 1 WHERE id = ?").run(id);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "card.created", id }]);

    hoisted.send.mockClear();
    db.prepare("UPDATE contents SET content = '[]' WHERE id = ?").run(contentId);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "card.updated", id }]);
    expect(hoisted.send.mock.calls[0][1].databaseName).toBe("alpha.db");
  });

  it("先建后删不产生事件；文章软删按删除处理", async () => {
    const id = card(0);
    db.prepare("DELETE FROM cards WHERE id = ?").run(id);
    const article = Number(
      db
        .prepare(
          "INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id) VALUES (1, 1, '文', '', '[]', '[]', 0)"
        )
        .run().lastInsertRowid
    );
    await vi.advanceTimersByTimeAsync(600);
    hoisted.send.mockClear();
    db.prepare("UPDATE articles SET is_delete = 1 WHERE id = ?").run(article);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "article.deleted", id: article }]);
  });

  it("引用型项目条目不作为项目文档；待办与日程给出集合级变化", async () => {
    db.prepare(
      `INSERT INTO project_item (create_time, update_time, title, children, parents, projects, ref_type, ref_id)
       VALUES (1, 1, '引用', '[]', '[]', '[]', 'card', 1)`
    ).run();
    broadcastDatabaseChange("schedule:changed", "alpha.db");
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "todos.changed" }, { type: "calendar.changed" }]);
  });

  it("同步下载重连后只发一次全量刷新", async () => {
    card(0);
    for (const callback of hoisted.connected) callback("alpha.db", "sync_download_reconnect");
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "workspace.reset" }]);
  });
});
