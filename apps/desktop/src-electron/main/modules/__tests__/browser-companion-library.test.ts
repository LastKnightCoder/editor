// @vitest-environment node
import Database from "better-sqlite3";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  prepared: null as unknown,
  writes: [] as string[],
  db: null as Database.Database | null,
  preparation: undefined as Promise<void> | undefined,
}));

vi.mock("electron");
vi.mock("../video-note-index-queue");
vi.mock("../database", () => ({
  default: {
    getCurrentDatabase: () => env.db,
    notifyExternalWrite: (event: string) => env.writes.push(event),
  },
}));
vi.mock("../database-notifications", () => ({ broadcastDatabaseChange: vi.fn() }));
vi.mock("../tables/excerpt", () => ({
  default: {},
  WEB_EXCERPT_SYNCED_EVENT: "excerpt:sync-web-page",
}));
vi.mock("../../services/content-execution", () => ({
  contentExecutor: {
    execute: async (request: { input: { nodes: unknown } }) => {
      env.prepared = request.input.nodes;
      await env.preparation;
      return { content: request.input.nodes };
    },
  },
}));

import { saveNote } from "../browser-companion/library";

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });
const createDatabase = () => {
  const connection = new Database(":memory:");
  connection.exec(schema);
  return connection;
};
let db: Database.Database;

beforeEach(() => {
  db = createDatabase();
  env.db = db;
  env.prepared = null;
  env.writes = [];
  env.preparation = undefined;
});
afterEach(() => db.close());

function counts(connection: Database.Database) {
  return ["web_page", "contents", "cards", "operation"].map(table =>
    connection.prepare(`SELECT count(*) FROM ${table}`).pluck().get()
  );
}

describe("saveNote", () => {
  it("编辑器节点原样存为卡片，末尾附来源链接", async () => {
    const content = [{ type: "header", level: 2, children: [text("要点")] }, paragraph("正文")];
    await expect(
      saveNote({ url: "https://a.com/x#h", title: "一篇文章", content })
    ).resolves.toEqual({ cardId: 1 });
    expect(env.prepared).toEqual([
      ...content,
      {
        type: "paragraph",
        children: [
          text("来源："),
          { type: "link", url: "https://a.com/x", children: [text("一篇文章")] },
          text(""),
        ],
      },
    ]);
    expect(db.prepare("SELECT tags,is_top FROM cards").get()).toEqual({ tags: "[]", is_top: 0 });
    expect(counts(db)).toEqual([1, 1, 1, 2]);
    expect(env.writes).toContain("create-card");
  });

  it("页面起过名时来源段用起的名", async () => {
    db.prepare(
      "INSERT INTO web_page(url,host,custom_title,create_time,update_time) VALUES(?,?,?,?,?)"
    ).run("https://a.com/x", "a.com", "React 19 新特性", 1, 1);
    await saveNote({
      url: "https://a.com/x",
      title: "React v19",
      content: [paragraph("正文")],
    });
    expect(JSON.stringify(env.prepared)).toContain("React 19 新特性");
    expect(JSON.stringify(env.prepared)).not.toContain("React v19");
  });

  it("拒绝空笔记、非法节点与非 http(s) 地址", async () => {
    await expect(saveNote({ url: "https://a.com", content: [paragraph("  ")] })).rejects.toThrow(
      "空的"
    );
    await expect(
      saveNote({ url: "https://a.com", content: [{ text: "裸文本" }] })
    ).rejects.toThrow();
    await expect(saveNote({ url: "https://a.com", content: "## markdown" })).rejects.toThrow();
    await expect(saveNote({ url: "file:///etc", content: [paragraph("x")] })).rejects.toThrow(
      "http"
    );
  });

  it("没有文字的分割线也算内容", async () => {
    await expect(
      saveNote({ url: "https://a.com", content: [{ type: "divide-line", children: [text("")] }] })
    ).resolves.toEqual({ cardId: 1 });
  });

  it("准备笔记时切库，两份资料库都不写入", async () => {
    const other = createDatabase();
    try {
      const preparation = Promise.withResolvers<void>();
      env.preparation = preparation.promise;
      const pending = saveNote({ url: "https://a.com", content: [paragraph("待保存")] });
      expect(env.prepared).toBeTruthy();
      env.db = other;
      preparation.resolve();
      await expect(pending).rejects.toThrow("准备笔记期间资料库已切换");
      expect(counts(db)).toEqual([0, 0, 0, 0]);
      expect(counts(other)).toEqual([0, 0, 0, 0]);
      expect(env.writes).toEqual([]);
    } finally {
      other.close();
    }
  });

  it("卡片流水失败时一起回滚网页登记、正文与卡片", async () => {
    db.exec(`CREATE TEMP TRIGGER reject_note_creation BEFORE INSERT ON operation
      WHEN NEW.operation_content_type = 'card' AND NEW.operation_action = 'insert'
      BEGIN SELECT RAISE(ABORT, '注入伴读卡片流水故障'); END`);
    const write = () => saveNote({ url: "https://a.com", content: [paragraph("待保存")] });
    await expect(write()).rejects.toThrow("注入伴读卡片流水故障");
    expect(counts(db)).toEqual([0, 0, 0, 0]);
    expect(env.writes).toEqual([]);
    db.exec("DROP TRIGGER reject_note_creation");
    await expect(write()).resolves.toEqual({ cardId: 1 });
    expect(counts(db)).toEqual([1, 1, 1, 2]);
  });
});
