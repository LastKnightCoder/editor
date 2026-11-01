import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { Replica, exchange } from "./replica.mjs";
import { SemanticReplica } from "./semantic-replica.mjs";
import { serveReplica, synchronize } from "./transport.mjs";

const directory = mkdtempSync(join(tmpdir(), "tau-sync-measure-"));
const replicas = [];
const count = Number(process.argv[2] ?? 1000);
const ReplicaType = process.argv[3] === "v2" ? SemanticReplica : Replica;
if (!Number.isSafeInteger(count) || count < 1 || count > 10_000)
  throw new Error("条目数量须在 1 到 10000 之间");
const round = value => Math.round(value * 100) / 100;
const elapsed = work => {
  const start = performance.now();
  work();
  return round(performance.now() - start);
};

try {
  const plain = new DatabaseSync(join(directory, "plain.db"));
  let plainMs;
  try {
    plain.exec(
      readFileSync(new URL("../../../packages/db-schema/schema/main.sql", import.meta.url), "utf8")
    );
    plain.exec("PRAGMA synchronous=FULL");
    const insert = plain.prepare(
      "INSERT INTO plugin_records VALUES(?,'spike','entries',?,1,1,NULL)"
    );
    plainMs = elapsed(() => {
      for (let index = 0; index < count; index++) {
        plain.exec("BEGIN IMMEDIATE");
        insert.run(`record-${index}`, JSON.stringify({ amount: index }));
        plain.exec("COMMIT");
      }
    });
  } finally {
    plain.close();
  }
  const desktop = new ReplicaType(join(directory, "desktop.db"), { device: "desktop", slot: 1 });
  replicas.push(desktop);
  const mobile = new ReplicaType(join(directory, "mobile.db"), {
    device: "mobile",
    slot: 2,
    baseline: desktop.initialBaseline(),
  });
  replicas.push(mobile);
  const capturedMs = elapsed(() => {
    const insert = desktop.db.prepare(
      "INSERT INTO plugin_records VALUES(?,'spike','entries',?,1,1,NULL)"
    );
    for (let index = 0; index < count; index++)
      desktop.transaction(() => insert.run(`record-${index}`, JSON.stringify({ amount: index })));
  });
  const server = await serveReplica(desktop);
  let firstSync;
  let syncMs;
  let idle;
  try {
    const start = performance.now();
    firstSync = await synchronize(mobile, server.url);
    syncMs = round(performance.now() - start);
    assert.deepEqual(desktop.snapshot(), mobile.snapshot());
    idle = await synchronize(mobile, server.url);
  } finally {
    await server.close();
  }
  const outgoingBytes = Buffer.byteLength(JSON.stringify(desktop.exportSince()));
  const note = "文".repeat(32 * 1024);
  desktop.transaction(db =>
    db.prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES(7,1,1,?)").run(note)
  );
  exchange(desktop, mobile);
  const frontier = mobile.frontier();
  const edits = 30;
  const noteMs = elapsed(() => {
    for (let index = 0; index < edits; index++)
      desktop.transaction(db =>
        db.prepare("UPDATE contents SET content=? WHERE id=7").run(`${note}${index}`)
      );
  });
  const noteDeltaBytes = Buffer.byteLength(JSON.stringify(desktop.exportSince(frontier)));
  exchange(desktop, mobile);
  assert.deepEqual(desktop.snapshot(), mobile.snapshot());
  console.log(
    JSON.stringify(
      {
        node: process.version,
        protocol: desktop.protocol,
        sqlite: desktop.db.prepare("SELECT sqlite_version() AS version").get().version,
        tables: desktop.tables.length,
        transactions: count,
        plainMs,
        capturedMs,
        capturedPerTransactionMs: round(capturedMs / count),
        overheadRatio: round(capturedMs / plainMs),
        httpCatchUpMs: syncMs,
        receivedTransactions: firstSync.received,
        firstCatchUpBytes: outgoingBytes,
        idleSentTransactions: idle.sent,
        idleReceivedTransactions: idle.received,
        noteBytes: Buffer.byteLength(note),
        noteEdits: edits,
        noteWriteMs: noteMs,
        noteDeltaBytes,
        noteVersionBytes: desktop.db
          .prepare(
            "SELECT sum(length(CAST(after_row AS BLOB))+coalesce(length(CAST(before_row AS BLOB)),0)) AS n FROM _spike_versions WHERE table_name='contents'"
          )
          .get().n,
        chunkBytes:
          desktop.protocol === 2
            ? desktop.db.prepare("SELECT sum(length(data)) AS n FROM _spike_chunks").get().n
            : 0,
        businessTablesEqual: true,
      },
      null,
      2
    )
  );
} finally {
  for (const replica of replicas) replica.close();
  rmSync(directory, { recursive: true, force: true });
}
