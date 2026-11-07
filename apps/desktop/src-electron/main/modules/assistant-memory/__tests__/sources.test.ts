import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";
import PathUtil from "../../../utils/PathUtil";
import { LibraryMemorySources } from "../sources";
import OperationTable from "../../tables/operation";
import { onOperationRecorded } from "../../operation-events";

function present<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("缺少测试资料");
  return value;
}

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../../database", () => ({ default: {} }));
vi.mock("../../user-setting", () => ({ default: {} }));

afterEach(() => vi.restoreAllMocks());

describe("个人记忆的真实资料来源", () => {
  it("只把真实更新流水按日聚合为编辑活动，不把新建和卡片知识当作用户经历", () => {
    const db = new Database(":memory:");
    const recorded: string[] = [];
    const unsubscribe = onOperationRecorded(event => recorded.push(event.action));
    try {
      db.exec(mainSchema);
      db.prepare(
        "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1,2,?,30,1)"
      ).run(
        JSON.stringify([
          { children: [{ text: "Rust 学习资料" }] },
          { children: [{ text: "不可写入个人记忆的知识点定义" }] },
        ])
      );
      db.exec("INSERT INTO cards(id,create_time,update_time,content_id) VALUES(2,1,2,1)");
      const sources = new LibraryMemorySources(db);
      const at = Date.now() - 10_000;
      OperationTable.insertOperation(db, "content", "insert", 1, at);
      expect(sources.list("activity", "", 10)).toEqual([]);
      OperationTable.insertOperation(db, "content", "update", 1, at + 1000);
      OperationTable.insertOperation(db, "content", "update", 1, at + 2000);
      const rows = sources.list("activity", "", 10);
      expect(rows).toHaveLength(1);
      expect(recorded).toEqual(["insert", "update", "update"]);
      const snapshot = sources.read(present(sources.head(rows[0])));
      expect(snapshot.parts[0].text).toContain("编辑了资料《Rust 学习资料》");
      expect(snapshot.parts[0].text).not.toContain("知识点定义");
      expect(snapshot.parts[0].observedAt).toBe(at + 2000);
      expect(snapshot.parts[0].role).toBe("activity");
    } finally {
      unsubscribe();
      db.close();
    }
  });

  it("按正文块定位已提交的引文，并用本地日期和分钟还原当前日程", () => {
    const db = new Database(":memory:");
    try {
      db.exec(mainSchema);
      const start = new Date(2026, 10, 10).getTime();
      const blocks = [
        { children: [{ text: "评审草稿" }] },
        { children: [{ text: "" }] },
        { children: [{ text: "决定从现有记忆重新整理" }] },
      ];
      db.prepare(
        "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1,2,?,30,1)"
      ).run(JSON.stringify(blocks));
      db.exec("INSERT INTO cards(id,create_time,update_time,content_id) VALUES(2,1,2,1)");
      db.exec(
        "INSERT INTO calendar(id,create_time,update_time,title,color) VALUES(1,1,2,'工作','')"
      );
      db.prepare(`INSERT INTO calendar_event(id,create_time,update_time,calendar_id,title,start_date,start_time,end_date,end_time)
        VALUES(2,1,2,1,'评审',?,810,?,870)`).run(start, start);
      const sources = new LibraryMemorySources(db);
      const content = sources.read(present(sources.head({ kind: "content", id: "1" })));
      expect(
        content.validate({
          kind: "content",
          id: "1",
          anchor: content.parts[0].anchor,
          quote: "从现有记忆重新整理",
        })
      ).toMatchObject({ block: 2, target: { kind: "card", id: 2 } });
      const calendar = sources.read(present(sources.head({ kind: "calendar", id: "2" })));
      const expectedStart = new Date(start);
      expectedStart.setMinutes(810);
      const expectedEnd = new Date(start);
      expectedEnd.setMinutes(870);
      expect(calendar.parts[0].text).toContain(
        expectedStart.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })
      );
      expect(calendar.parts[0].expiresAt).toBe(expectedEnd.getTime());
    } finally {
      db.close();
    }
  });

  it("读取真实 pi 会话的当前分支，保留可打开的消息标识", () => {
    const temp = mkdtempSync(join(tmpdir(), "tau-memory-sources-"));
    vi.spyOn(PathUtil, "getAppDir").mockReturnValue(temp);
    const db = new Database(join(temp, "work.db"));
    try {
      db.exec(mainSchema);
      const file = "test.jsonl";
      db.prepare(`INSERT INTO chat_session(id,scope,session_file,title,create_time,update_time)
        VALUES('source','main-chat',?,'评审对话',1,2)`).run(file);
      const directory = join(temp, "sessions", "work");
      mkdirSync(directory, { recursive: true });
      const timestamp = "2026-11-06T08:00:00.000Z";
      writeFileSync(
        join(directory, file),
        [
          { type: "session", version: 3, id: "source", timestamp, cwd: temp },
          {
            type: "message",
            id: "first",
            parentId: null,
            timestamp,
            message: { role: "user", content: "评审先看方案对比" },
          },
        ]
          .map(entry => JSON.stringify(entry))
          .join("\n") + "\n"
      );
      const sources = new LibraryMemorySources(db);
      const source = { kind: "chat", id: "source" } as const;
      const head = present(sources.head(source));
      expect(sources.list("chat", "", 4)[0]?.modifiedAt).toBe(head.modifiedAt);
      const snapshot = sources.read(head);
      expect(snapshot.parts[0]).toMatchObject({
        messageId: "first",
        role: "user",
        text: "评审先看方案对比",
      });
      expect(
        snapshot.validate({ ...source, anchor: "first:0", quote: "先看方案对比" })
      ).toMatchObject({ messageId: "first", title: "评审对话" });
    } finally {
      db.close();
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
