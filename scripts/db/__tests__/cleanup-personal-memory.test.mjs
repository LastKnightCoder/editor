import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { cleanupPersonalMemory, locateMemoryFile } from "../cleanup-personal-memory.mjs";

const desktopRequire = createRequire(
  new URL("../../../apps/desktop/package.json", import.meta.url)
);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tau-memory-cleanup-"));
  const libraryPath = join(directory, "notes.db");
  const library = new DatabaseSync(libraryPath);
  library.exec(
    "CREATE TABLE library_identity(id INTEGER PRIMARY KEY,source_id TEXT); INSERT INTO library_identity VALUES(1,'identity'); CREATE TABLE cards(id INTEGER PRIMARY KEY,content_id INTEGER); INSERT INTO cards VALUES(1,11)"
  );
  library.close();
  const memoryDirectory = join(directory, "assistant-memory");
  mkdirSync(memoryDirectory);
  const memoryPath = join(
    memoryDirectory,
    createHash("sha256").update(basename(libraryPath)).digest("hex") + ".sqlite"
  );
  const memory = new DatabaseSync(memoryPath, { allowExtension: true });
  memory.loadExtension(desktopRequire("sqlite-vec").getLoadablePath());
  memory.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE memory(id INTEGER PRIMARY KEY,kind TEXT,topic TEXT,text TEXT,manual INTEGER);
    CREATE TABLE evidence(memory_id INTEGER REFERENCES memory(id) ON DELETE CASCADE,kind TEXT,source_id TEXT,anchor TEXT,quote TEXT);
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO meta VALUES('library-source','identity');
    CREATE TABLE progress(kind TEXT,source_id TEXT);
    CREATE TABLE memory_embedding(memory_id INTEGER PRIMARY KEY REFERENCES memory(id) ON DELETE CASCADE,input TEXT);
    CREATE TABLE memory_model(id INTEGER PRIMARY KEY,text TEXT);
    CREATE TABLE memory_model_evidence(model_id INTEGER REFERENCES memory_model(id) ON DELETE CASCADE,memory_id INTEGER REFERENCES memory(id) ON DELETE CASCADE);
    CREATE VIRTUAL TABLE memory_search USING fts5(text,topic);
    CREATE VIRTUAL TABLE memory_vec USING vec0(embedding FLOAT[3]);
    CREATE TRIGGER memory_delete AFTER DELETE ON memory BEGIN DELETE FROM memory_search WHERE rowid=old.id; END;
  `);
  const rows = [
    [1, "fact", "所有权", "变量只有一个所有者", 0],
    [2, "fact", "学习安排", "用户正在学习 Rust", 0],
    [3, "fact", "闭包", "闭包可以捕获环境", 0],
    [4, "fact", "手动条目", "经过用户明确更正", 1],
    [5, "event", "项目经历", "完成了一个项目", 0],
    [6, "fact", "文章事实", "文章中记录了一个事实", 0],
    [7, "preference", "表达方式", "我喜欢简洁回应", 0],
  ];
  for (const row of rows) {
    memory.prepare("INSERT INTO memory VALUES(?,?,?,?,?)").run(...row);
    memory
      .prepare("INSERT INTO memory_search(rowid,text,topic) VALUES(?,?,?)")
      .run(row[0], row[3], row[2]);
    memory
      .prepare("INSERT INTO evidence VALUES(?,?,?,?,?)")
      .run(row[0], row[0] === 7 ? "chat" : "content", row[0] === 6 ? "12" : "11", "a", row[3]);
  }
  memory.prepare("INSERT INTO evidence VALUES(3,'chat','session','m','用户原话')").run();
  memory.exec(
    "INSERT INTO memory_model VALUES(1,'受知识点污染的模型'),(2,'有效的偏好'); INSERT INTO memory_model_evidence VALUES(1,1),(2,7); INSERT INTO progress VALUES('content','11')"
  );
  for (const id of [1, 2]) {
    memory
      .prepare("INSERT INTO memory_vec(rowid,embedding) VALUES(?,?)")
      .run(BigInt(id), "[1,0,0]");
    memory.prepare("INSERT INTO memory_embedding VALUES(?,?)").run(id, "输入" + id);
  }
  memory.close();
  const read = (path, sql) => {
    const db = new DatabaseSync(path, { readOnly: true, allowExtension: true });
    try {
      if (sql.includes("memory_vec"))
        db.loadExtension(desktopRequire("sqlite-vec").getLoadablePath());
      return db
        .prepare(sql)
        .all()
        .map(row => ({ ...row }));
    } finally {
      db.close();
    }
  };
  return {
    libraryPath,
    memoryPath,
    read,
    close() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("预览不修改数据，执行前备份且仅移除默认知识候选及其派生索引", async () => {
  const f = fixture();
  try {
    assert.equal(locateMemoryFile(f.libraryPath), f.memoryPath);
    const preview = await cleanupPersonalMemory({ libraryPath: f.libraryPath });
    assert.equal(preview.status, "preview");
    assert.deepEqual(
      preview.selected.map(row => row.id),
      [1]
    );
    assert.deepEqual(
      preview.ambiguous.map(row => row.id),
      [2, 5]
    );
    assert.equal(f.read(f.memoryPath, "SELECT id FROM memory").length, 7);
    const applied = await cleanupPersonalMemory({ libraryPath: f.libraryPath, apply: true });
    assert.equal(applied.status, "cleaned");
    assert.equal(f.read(applied.backupPath, "SELECT id FROM memory").length, 7);
    assert.deepEqual(
      f.read(f.memoryPath, "SELECT id FROM memory ORDER BY id"),
      [2, 3, 4, 5, 6, 7].map(id => ({ id }))
    );
    assert.deepEqual(f.read(f.memoryPath, "SELECT id FROM memory_model"), [{ id: 2 }]);
    assert.deepEqual(f.read(f.memoryPath, "SELECT memory_id FROM memory_embedding"), [
      { memory_id: 2 },
    ]);
    assert.deepEqual(f.read(f.memoryPath, "SELECT rowid FROM memory_vec"), [{ rowid: 2 }]);
    assert.deepEqual(f.read(f.memoryPath, "SELECT rowid FROM memory_search WHERE rowid=1"), []);
    assert.equal(f.read(f.libraryPath, "SELECT id FROM cards").length, 1);
    assert.equal(
      (await cleanupPersonalMemory({ libraryPath: f.libraryPath, apply: true })).status,
      "unchanged"
    );
  } finally {
    f.close();
  }
});

test("不确定的个人表述只能显式选择，拒绝清理手动或混合证据", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      cleanupPersonalMemory({ libraryPath: f.libraryPath, memoryPath: f.libraryPath, apply: true }),
      /不能是同一文件/
    );
    for (const id of [3, 4, 7])
      await assert.rejects(
        cleanupPersonalMemory({ libraryPath: f.libraryPath, apply: true, ids: [id] }),
        /证据全部来自卡片正文/
      );
    const result = await cleanupPersonalMemory({
      libraryPath: f.libraryPath,
      apply: true,
      ids: [2],
    });
    assert.equal(result.selectedCount, 1);
    assert.equal(f.read(f.memoryPath, "SELECT id FROM memory WHERE id=2").length, 0);
    assert.equal(f.read(f.memoryPath, "SELECT id FROM memory WHERE id=1").length, 1);
  } finally {
    f.close();
  }
});
