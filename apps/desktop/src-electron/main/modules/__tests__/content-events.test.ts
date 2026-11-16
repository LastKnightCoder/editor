import Database from "better-sqlite3";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron");

// 切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue");

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import {
  bindContentWriteConnection,
  onContentWritten,
  type ContentWrittenEvent,
} from "../content-events";

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

  it("向索引发布登记连接名，同名文件的其他连接仍使用原回落", () => {
    const other = new Database(":memory:");
    try {
      other.exec(MAIN_SCHEMA_SQL);
      bindContentWriteConnection(db, "用户资料库");
      const named = ContentTable.createContent(db, { content: doc("正文") });
      const independent = ContentTable.createContent(other, { content: doc("对照正文") });
      expect(events).toEqual([
        { dbName: "用户资料库", contentId: named, action: "create" },
        { dbName: ":memory:", contentId: independent, action: "create" },
      ]);
    } finally {
      other.close();
    }
  });

  it("新建业务正文的异步回调被事务拒绝且不发出创建事件", () => {
    expect(() =>
      ContentTable.createOwnedContent(db, { content: doc("a") }, async id => id)
    ).toThrow("Transaction function cannot return a promise");
    expect(db.prepare("SELECT id FROM contents").all()).toEqual([]);
    expect(db.prepare("SELECT id FROM operation").all()).toEqual([]);
    expect(events).toEqual([]);
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
    // createContent / deleteContent / patchNodes（发事件）+ patchNodes 静默分支
    //（只补勾选项 taskId，不算编辑、不改 update_time，其他派生数据不读 taskId，故不发事件）
    "main/modules/tables/content.ts": 4,
    "main/modules/tables/content-replacement.ts": 1,
    "main/modules/tables/content-document.ts": 1,
    // 首次拆块只切换存储布局；正文变化由调用方完成投影后统一通知。
    "main/modules/tables/content-document-blocks.ts": 1,
  };

  // eval/ 是对独立内存库构造夹具的评测脚本，不走生产写入路径，与 __tests__ 同样不算写入点。
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (statSync(path).isDirectory())
        return name === "__tests__" || name === "eval" ? [] : walk(path);
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

  it("正文投影提交并确认修订后，只在正文实际变化时发出一次事件", () => {
    const source = readFileSync(join(ROOT, "main/modules/content-runtime/index.ts"), "utf8");
    const start = source.indexOf("protected async projectSession(");
    const end = source.indexOf("async removeSession(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const projection = source.slice(start, end);
    const submitted = projection.indexOf("const result = projection.commit(");
    const committed = projection.indexOf("committed = true;");
    const acknowledged = projection.indexOf("source.projectionRevision = saved.revision;");
    const notified = projection.indexOf('emitContentWritten(database, source.contentId, "update")');
    expect(submitted).toBeGreaterThanOrEqual(0);
    expect(committed).toBeGreaterThan(submitted);
    expect(acknowledged).toBeGreaterThan(committed);
    expect(notified).toBeGreaterThan(acknowledged);
    expect(projection).toContain("changed = result.changed;");
    expect(projection).toMatch(
      /if \(changed\) \{\s*this\.broadcast\("content:updated", \{[^}]*\}\);\s*emitContentWritten\(database, source\.contentId, "update"\);\s*\}/
    );
    expect(projection.match(/emitContentWritten\(/g)).toHaveLength(1);
  });
});
