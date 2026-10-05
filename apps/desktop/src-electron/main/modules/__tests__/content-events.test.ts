import Database from "better-sqlite3";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import { onContentWritten, type ContentWrittenEvent } from "../content-events";

const doc = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as never;

describe("正文写入总线", () => {
  let db: Database.Database;
  let events: ContentWrittenEvent[];
  let off: () => void;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    events = [];
    off = onContentWritten(event => events.push(event));
  });

  afterEach(() => {
    off();
    db.close();
  });

  it("新建、修改、引用计数归零删除各发一次事件", () => {
    const id = ContentTable.createContent(db, { content: doc("a") });
    ContentTable.updateContent(db, id, { content: doc("b") });
    ContentTable.incrementRefCount(db, id);
    ContentTable.deleteContent(db, id);
    expect(events.map(e => [e.contentId, e.action])).toEqual([
      [id, "create"],
      [id, "update"],
    ]);
    ContentTable.deleteContent(db, id);
    expect(events.at(-1)).toMatchObject({ contentId: id, action: "delete", dbName: ":memory:" });
  });

  it("监听器抛错不影响写入与其他监听器", () => {
    const seen: number[] = [];
    const offBad = onContentWritten(() => {
      throw new Error("boom");
    });
    const offGood = onContentWritten(e => seen.push(e.contentId));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = ContentTable.createContent(db, { content: doc("a") });
    expect(seen).toEqual([id]);
    expect(ContentTable.getContentById(db, id)).not.toBeNull();
    offBad();
    offGood();
    spy.mockRestore();
  });
});

/**
 * 护栏：主进程里改写正文（INSERT / DELETE / UPDATE ... content =）的语句只允许出现在已接入总线的位置。
 * 新增写入点时先接 emitContentWritten，再更新这里的白名单。
 */
describe("正文写入点白名单", () => {
  const ROOT = join(__dirname, "../../..");
  const WRITE_SQL =
    /INSERT\s+INTO\s+contents\b|DELETE\s+FROM\s+contents\b|UPDATE\s+contents\s+SET[^"'`]*\bcontent\s*=/gi;
  const ALLOWED: Record<string, number> = {
    // createContent / updateContent / deleteContent 与两处开库迁移（迁移由对账兜底）
    "main/modules/tables/content.ts": 5,
    "main/modules/collaboration/content-sessions.ts": 1,
    "main/modules/collaboration/content-repository.ts": 1,
  };

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : walk(path);
      return /\.ts$/.test(name) ? [path] : [];
    });

  it("没有未接入总线的写入点", () => {
    const found: Record<string, number> = {};
    for (const file of walk(ROOT)) {
      const hits = readFileSync(file, "utf8").match(WRITE_SQL);
      if (hits) found[relative(ROOT, file).split("\\").join("/")] = hits.length;
    }
    expect(found).toEqual(ALLOWED);
  });

  it("协作投影写库成功处发出事件", () => {
    const source = readFileSync(join(ROOT, "main/modules/collaboration/index.ts"), "utf8");
    expect(source).toMatch(/emitContentWritten\(database, source\.contentId, "update"\)/);
  });
});
