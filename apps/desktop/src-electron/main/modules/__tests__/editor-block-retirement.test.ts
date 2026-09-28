import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { retireEditorBlocks } from "@tau/db-schema/src/editor-block-retirement";
import { EDITOR_BLOCK_CARRIERS } from "@tau/db-schema/src/retired-editor-blocks";
import { importFromMarkdown } from "@tau/markdown";

const directories: string[] = [];
const databases: Database.Database[] = [];
const legacy = JSON.stringify([
  { type: "question", questionId: 123, children: [{ text: "" }] },
  { type: "paragraph", children: [{ type: "formatted", text: "保留" }] },
  { type: "chat-reference", chatId: 456, children: [{ text: "" }] },
]);
function directory() {
  const path = mkdtempSync(join(tmpdir(), "tau-editor-retire-"));
  directories.push(path);
  return path;
}
function open(path = ":memory:") {
  const db = new Database(path);
  databases.push(db);
  return db;
}
function populate(db: Database.Database) {
  db.exec(
    "CREATE TABLE contents(id INTEGER PRIMARY KEY, content TEXT, count INTEGER, update_time INTEGER); CREATE TABLE questions(id INTEGER PRIMARY KEY, question_content TEXT, answers TEXT, description TEXT)"
  );
  db.prepare("INSERT INTO contents VALUES(1,?,0,1)").run(legacy);
  db.prepare("INSERT INTO questions VALUES(123,'原问题','[1]',?)").run(legacy);
}
afterEach(() => {
  databases.splice(0).forEach(db => {
    if (db.open) db.close();
  });
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
});

describe("编辑器引用块退役", () => {
  it("WAL 备份、恢复重迁移、原问题和答案不变", () => {
    const dir = directory();
    const path = join(dir, "main.db");
    const db = open(path);
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
    populate(db);
    expect(retireEditorBlocks(db, path)).toBe(2);
    const first = db.prepare("SELECT * FROM contents").get();
    expect(first).toMatchObject({ count: 2 });
    expect(retireEditorBlocks(db, path)).toBe(0);
    expect(db.prepare("SELECT * FROM contents").get()).toEqual(first);
    expect(db.prepare("SELECT question_content,answers FROM questions").get()).toEqual({
      question_content: "原问题",
      answers: "[1]",
    });
    const backup = readdirSync(dir).filter(name => name.endsWith(".bak"));
    expect(backup).toHaveLength(1);
    const snapshot = open(join(dir, backup[0]));
    expect(snapshot.prepare("SELECT content FROM contents").get()).toEqual({ content: legacy });
    snapshot.close();
    db.close();
    copyFileSync(join(dir, backup[0]), path);
    expect(retireEditorBlocks(open(path), path)).toBe(2);
    // 恢复旧备份重迁移时重新备份，且只保留最新一份
    expect(readdirSync(dir).filter(name => name.endsWith(".bak"))).toHaveLength(1);
  });
  it("备份失败保留原内容，损坏 JSON 跳过清理不阻断", () => {
    const db = open();
    populate(db);
    expect(() => retireEditorBlocks(db, join(directory(), "missing", "main.db"))).toThrow();
    expect(db.prepare("SELECT content FROM contents").get()).toEqual({ content: legacy });
    // 触发器路径遇到损坏 JSON 保留原值放行写入，不再抛错
    db.prepare("INSERT INTO contents VALUES(2,?,0,1)").run('{"type":"question"');
    expect(retireEditorBlocks(db, ":memory:")).toBe(2);
    expect(db.prepare("SELECT content FROM contents WHERE id=2").get()).toEqual({
      content: '{"type":"question"',
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM contents WHERE content=?").get(legacy)).toEqual({
      n: 0,
    });
    expect(db.inTransaction).toBe(false);
  });
  it("写入失败回滚所有载体，分页扫描不遗漏", () => {
    const db = open();
    populate(db);
    for (let id = 2; id <= 205; id++)
      db.prepare("INSERT INTO contents VALUES(?,?,0,1)").run(id, legacy);
    db.exec(
      "CREATE TRIGGER fail_retirement BEFORE UPDATE ON questions BEGIN SELECT RAISE(ABORT,'写入失败'); END"
    );
    expect(() => retireEditorBlocks(db, ":memory:")).toThrow("写入失败");
    expect(db.prepare("SELECT COUNT(*) AS n FROM contents WHERE content=?").get(legacy)).toEqual({
      n: 205,
    });
    db.exec("DROP TRIGGER fail_retirement");
    expect(retireEditorBlocks(db, ":memory:")).toBe(206);
  });
  it("所有载体的 INSERT 与 UPDATE 都阻止旧块回流，主 schema 无新增触发器", () => {
    const db = open();
    for (const table of new Set(EDITOR_BLOCK_CARRIERS.map(([name]) => name))) {
      const fields = EDITOR_BLOCK_CARRIERS.filter(([name]) => name === table).map(
        ([, field]) => `"${field}" TEXT`
      );
      db.exec(
        `CREATE TABLE "${table}"(id INTEGER PRIMARY KEY, count INTEGER DEFAULT 0, update_time INTEGER DEFAULT 1,${fields.join(",")})`
      );
    }
    retireEditorBlocks(db, ":memory:");
    for (const [table, column] of EDITOR_BLOCK_CARRIERS) {
      db.prepare(`INSERT OR IGNORE INTO "${table}"(id,"${column}") VALUES(1,?)`).run(legacy);
      db.prepare(`UPDATE "${table}" SET "${column}"=? WHERE id=1`).run(legacy);
      const row = db.prepare(`SELECT "${column}" AS value FROM "${table}"`).get() as {
        value: string;
      };
      expect(JSON.parse(row.value)).toHaveLength(1);
      expect(row.value).not.toContain("questionId");
    }
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'").get()
    ).toEqual({ n: 0 });
  });
  it("Markdown 三种旧指令都被丢弃，普通文本保留", () => {
    const result = importFromMarkdown(
      "保留\n\n::chat-reference{chatId=1}\n\n:::question\n丢弃\n:::\n\n:question-card[丢弃]\n"
    );
    expect(JSON.stringify(result)).toContain("保留");
    expect(JSON.stringify(result)).not.toMatch(/chat-reference|question-card|丢弃/);
  });
  it("转义类型不能漏删，旧闪卡纯文本不当作损坏 JSON", () => {
    const db = open();
    populate(db);
    db.prepare("UPDATE contents SET content=? WHERE id=1").run(
      '[{"type":"\\u0071uestion","children":[]}]'
    );
    db.exec(
      "CREATE TABLE flashcards(id INTEGER PRIMARY KEY,prompt TEXT,detail TEXT); INSERT INTO flashcards VALUES(1,'plain question','plain answer')"
    );
    retireEditorBlocks(db, ":memory:");
    expect(JSON.stringify(db.prepare("SELECT content FROM contents").get())).not.toContain("0071");
    expect(db.prepare("SELECT prompt,detail FROM flashcards").get()).toEqual({
      prompt: "plain question",
      detail: "plain answer",
    });
  });
  it("只有关联的派生实体时间戳与日记字数更新", () => {
    const db = open();
    populate(db);
    db.exec(
      "CREATE TABLE cards(id INTEGER PRIMARY KEY,content_id INTEGER,update_time INTEGER); INSERT INTO cards VALUES(1,1,1),(2,999,1); CREATE TABLE diary_entries(id INTEGER PRIMARY KEY,content_id INTEGER,word_count INTEGER,update_time INTEGER); INSERT INTO diary_entries VALUES(1,NULL,0,1),(2,NULL,123,1); CREATE TABLE diary_segments(id INTEGER PRIMARY KEY,diary_id INTEGER,content_id INTEGER,update_time INTEGER); INSERT INTO diary_segments VALUES(1,1,1,1)"
    );
    retireEditorBlocks(db, ":memory:");
    const cards = db.prepare("SELECT update_time FROM cards ORDER BY id").all() as {
      update_time: number;
    }[];
    expect(cards[0].update_time).toBeGreaterThan(1);
    expect(cards[1].update_time).toBe(1);
    expect(db.prepare("SELECT word_count FROM diary_entries ORDER BY id").all()).toEqual([
      { word_count: 2 },
      { word_count: 123 },
    ]);
  });
});
