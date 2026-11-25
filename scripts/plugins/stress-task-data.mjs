import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { spawn } from "node:child_process";
import { once } from "node:events";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "packages/plugins/package.json"));
const driver = createRequire(path.join(root, "apps/collaboration-server/package.json")).resolve(
  "better-sqlite3"
);
const Database = require(driver);
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(os.tmpdir(), "tau-plugin-task-stress-"));
const runtime = path.join(directory, "runtime.mjs");
await build({
  stdin: {
    contents: `export { default as Changes } from ${JSON.stringify(path.join(root, "apps/desktop/src-electron/main/modules/tables/data-changes.ts"))};
export { default as Identities } from ${JSON.stringify(path.join(root, "apps/desktop/src-electron/main/modules/tables/document-task-identities.ts"))};
export { queryDataChanges } from ${JSON.stringify(path.join(root, "packages/plugins/src/data-changes.ts"))};`,
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: runtime,
  logLevel: "silent",
});
const { Changes, Identities, queryDataChanges } = await import(pathToFileURL(runtime).href);
const filename = path.join(directory, "stress.db");
let db = new Database(filename);
db.pragma("journal_mode=WAL");
db.pragma("foreign_keys=ON");
db.pragma("busy_timeout=15000");
db.exec(await readFile(path.join(root, "packages/db-schema/schema/main.sql"), "utf8"));
while (!Identities.prepare(db)) {
  // 已有库按批补齐，直到可靠身份目录就绪。
}
db.prepare(
  "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(1,'工作',100,100)"
).run();
const expected = new Set();
const results = [];
const measure = async (name, run) => {
  const start = performance.now();
  const details = await run();
  const result = { name, milliseconds: Math.round(performance.now() - start), ...details };
  results.push(result);
  process.stdout.write(JSON.stringify(result) + "\n");
};
const body = ids =>
  JSON.stringify([
    {
      type: "check-list",
      children: ids.map(taskId => ({
        type: "check-list-item",
        taskId,
        checked: true,
        taskArchived: true,
        children: [{ type: "paragraph", children: [{ text: taskId }] }],
      })),
    },
  ]);
const addDocument = (id, names) => {
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(?,100,100,?,1)"
  ).run(id, body(names));
  db.prepare(
    "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',?,100,100)"
  ).run(id);
  for (const name of names) {
    expected.add(
      name === "task@2026-11-25"
        ? `document:v2:${id}:100:${Buffer.from(name).toString("hex").toUpperCase()}`
        : `document:${id}:100:${name}`
    );
  }
};
let scope = "stress-device:epoch";
const query = input =>
  queryDataChanges(input, "stress-plugin", async request => Changes.read(db, request, scope));
const consume = (page, seen) => {
  for (const item of page.items) {
    if (expected.has(item.id)) seen.add(item.id);
    else seen.delete(item.id);
  }
};
const drain = async (input, seen = new Set(), interleave) => {
  let pages = 0,
    page;
  do {
    page = await query({ ...input, ...(page ? { cursor: page.cursor } : {}) });
    consume(page, seen);
    pages++;
    if (interleave) await interleave(pages, page);
    assert(pages < 100000, "分页没有收敛");
  } while (page.hasMore);
  assert(page.checkpoint);
  return { pages, checkpoint: page.checkpoint, seen };
};

await measure("seed-real-sqlite", () => {
  db.transaction(() => {
    for (let index = 0; index < 3000; index++) {
      const row = db
        .prepare(
          "INSERT INTO todo_item(group_id,title,create_time,update_time) VALUES(1,?,100,100)"
        )
        .run(`任务${index}`);
      expected.add(`todo:${row.lastInsertRowid}:100`);
    }
    for (let index = 0; index < 1200; index++)
      addDocument(
        1000 + index,
        Array.from({ length: 6 }, (_, n) =>
          index === 0 && n === 0 ? "task@2026-11-25" : `task-${n}`
        )
      );
  })();
  return { standalone: 3000, documents: 1200, documentTasks: 7200 };
});
await measure("restartable-backfill-existing-library", () => {
  const before = JSON.stringify(
    db.prepare("SELECT id,create_time,content FROM contents ORDER BY id").all()
  );
  db.transaction(() => {
    db.prepare("DELETE FROM document_task_identities").run();
    db.prepare(
      "UPDATE document_task_projection_state SET ready=0,after_content_id=0,epoch='rebuild' WHERE id='main'"
    ).run();
  })();
  assert.equal(Identities.prepare(db, 100), false);
  db.close();
  db = new Database(filename);
  db.pragma("foreign_keys=ON");
  db.pragma("busy_timeout=15000");
  let batches = 1;
  while (!Identities.prepare(db, 100)) batches++;
  assert.equal(
    JSON.stringify(db.prepare("SELECT id,create_time,content FROM contents ORDER BY id").all()),
    before
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM document_task_visible_identities").get().n,
    7200
  );
  return { batches, documents: 1200, documentTasks: 7200, unchangedBodies: true };
});
const seen = new Set();
let checkpoint;
await measure("mixed-bootstrap-with-concurrent-mutations", async () => {
  const result = await drain({ domains: ["todo"], todoSource: "all", limit: 73 }, seen, pages => {
    if (pages !== 7) return;
    db.transaction(() => {
      db.prepare("DELETE FROM todo_item WHERE id=2999").run();
      expected.delete("todo:2999:100");
      db.prepare("UPDATE contents SET content=? WHERE id=1001").run(
        body(["task-1", "task-2", "task-3", "task-4", "task-5"])
      );
      expected.delete("document:1001:100:task-0");
      addDocument(800000, ["new-a", "new-b"]);
      db.prepare(
        "INSERT INTO doc_task_settings(content_id,task_id,kind,create_time) VALUES(1010,'','excluded',1)"
      ).run();
      db.prepare("DELETE FROM doc_task_settings WHERE content_id=1010").run();
    })();
  });
  assert.deepEqual([...seen].sort(), [...expected].sort());
  checkpoint = result.checkpoint;
  return { pages: result.pages, reconciled: seen.size, pageLimit: 73 };
});
await measure("round-trip-small-pages-and-reopen", async () => {
  db.close();
  db = new Database(filename);
  db.pragma("foreign_keys=ON");
  assert.equal(
    (await query({ domains: ["todo"], todoSource: "all", cursor: checkpoint })).items.length,
    0
  );
  const result = await drain({ domains: ["todo"], todoSource: "document", limit: 17 });
  assert.deepEqual(
    [...result.seen].sort(),
    [...expected].filter(value => value.startsWith("document:")).sort()
  );
  return { pages: result.pages, documentTasks: result.seen.size, pageLimit: 17 };
});
await measure("rollback-fault-injection", () => {
  const before = db.prepare("SELECT MAX(seq) AS seq FROM data_change_log").get().seq;
  for (let batch = 0; batch < 100; batch++) {
    assert.throws(
      () =>
        db.transaction(() => {
          db.prepare("UPDATE todo_item SET title=? WHERE id=1").run(`rollback-${batch}`);
          db.prepare("UPDATE contents SET content=? WHERE id=1000").run(body([`doomed-${batch}`]));
          throw new Error("injected failure");
        })(),
      /injected failure/
    );
  }
  assert.equal(db.prepare("SELECT MAX(seq) AS seq FROM data_change_log").get().seq, before);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM document_task_identities WHERE content_id=1000").get().n,
    6
  );
  return { rolledBackTransactions: 100 };
});
await measure("four-independent-writers", async () => {
  const source = `const {workerData,parentPort}=require('node:worker_threads');const Database=require(workerData.driver);const db=new Database(workerData.filename);db.pragma('foreign_keys=ON');db.pragma('busy_timeout=15000');
  for(let i=0;i<300;i++)db.transaction(()=>{const id=900000+workerData.worker*1000+i;const content=JSON.stringify([{type:'check-list-item',taskId:'worker-task',children:[{type:'paragraph',children:[{text:'并发'}]}]}]);db.prepare('INSERT INTO contents(id,create_time,update_time,content,ref_count) VALUES(?,100,100,?,1)').run(id,content);db.prepare("INSERT INTO articles(title,content_id,create_time,update_time) VALUES('并发',?,100,100)").run(id);})();db.close();parentPort.postMessage('done');`;
  await Promise.all(
    Array.from(
      { length: 4 },
      (_, worker) =>
        new Promise((resolve, reject) => {
          const thread = new Worker(source, {
            eval: true,
            workerData: { driver, filename, worker },
          });
          thread.once("error", reject);
          thread.once("exit", code =>
            code === 0 ? resolve() : reject(new Error(`writer exit ${code}`))
          );
        })
    )
  );
  for (let worker = 0; worker < 4; worker++)
    for (let index = 0; index < 300; index++)
      expected.add(`document:${900000 + worker * 1000 + index}:100:worker-task`);
  const result = await drain(
    { domains: ["todo"], todoSource: "all", cursor: checkpoint, limit: 31 },
    seen
  );
  checkpoint = result.checkpoint;
  assert.deepEqual([...seen].sort(), [...expected].sort());
  return { writers: 4, committedTransactions: 1200, reconciled: seen.size, pages: result.pages };
});
await measure("hard-kill-uncommitted-writer-and-recover", async () => {
  const before = db.prepare("SELECT MAX(seq) AS seq FROM data_change_log").get().seq;
  const source = `const Database=require(${JSON.stringify(driver)});const db=new Database(${JSON.stringify(filename)});db.exec('BEGIN IMMEDIATE');db.prepare("UPDATE todo_item SET title='uncommitted-crash' WHERE id=1").run();process.send('uncommitted');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ["-e", source], {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  await Promise.race([
    once(child, "message"),
    once(child, "exit").then(([code]) => {
      throw new Error(`crash fixture exited early: ${code}`);
    }),
  ]);
  const exit = once(child, "exit");
  child.kill("SIGKILL");
  await exit;
  db.close();
  db = new Database(filename);
  db.pragma("foreign_keys=ON");
  assert.notEqual(
    db.prepare("SELECT title FROM todo_item WHERE id=1").get().title,
    "uncommitted-crash"
  );
  assert.equal(db.prepare("SELECT MAX(seq) AS seq FROM data_change_log").get().seq, before);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  return { signal: "SIGKILL", integrity: "ok", lostCommittedChanges: 0 };
});
await measure("bounded-retention-and-reset", async () => {
  const update = db.prepare("UPDATE todo_item SET title=? WHERE id=1");
  for (let batch = 0; batch < 210; batch++)
    db.transaction(() => {
      for (let i = 0; i < 500; i++) update.run(`pressure-${batch}-${i}`);
    })();
  await assert.rejects(
    query({ domains: ["todo"], todoSource: "all", cursor: checkpoint }),
    error => error.reason === "history-expired"
  );
  assert(db.prepare("SELECT COUNT(*) AS n FROM data_change_log").get().n <= 100000);
  const full = await drain({ domains: ["todo"], todoSource: "all", limit: 100 });
  assert.deepEqual([...full.seen].sort(), [...expected].sort());
  scope = "replacement";
  await assert.rejects(
    query({ domains: ["todo"], todoSource: "all", cursor: full.checkpoint }),
    error => error.reason === "scope-changed"
  );
  return {
    committedUpdates: 105000,
    retained: db.prepare("SELECT COUNT(*) AS n FROM data_change_log").get().n,
    reconciled: full.seen.size,
  };
});
db.close();
await writeFile(
  path.join(directory, "report.json"),
  JSON.stringify({ results, database: filename }, null, 2)
);
process.stdout.write(`REPORT ${path.join(directory, "report.json")}\n`);
