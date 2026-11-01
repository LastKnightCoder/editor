import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { LinearReplica, syncLinear } from "./linear-replica.mjs";
import { serveLinear, synchronizeLinear } from "./linear-transport.mjs";

const directory = mkdtempSync(join(tmpdir(), "tau-linear-demo-"));
const peers = [];
const keep = process.argv.includes("--keep");
const edit = (peer, id, value) =>
  peer.transaction(tx => tx.update("contents", [id], { content: value }), { scoped: true });
try {
  const authority = new LinearReplica(join(directory, "desktop.db"), { device: "desktop" });
  peers.push(authority);
  authority.transaction(db =>
    db
      .prepare(
        "INSERT INTO contents(id,create_time,update_time,content) VALUES(1,1,1,'note-A'),(2,1,1,'note-B'),(3,1,1,?)"
      )
      .run("unrelated".repeat(128 * 1024))
  );
  const mobile = new LinearReplica(join(directory, "mobile.db"), {
    device: "mobile",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(mobile);
  const fullSnapshotBytes = Buffer.byteLength(mobile.exportSnapshot().body);
  edit(authority, 1, "desktop-A");
  edit(mobile, 2, "mobile-B");
  const server = await serveLinear(authority);
  let automatic;
  try {
    automatic = await synchronizeLinear(mobile, server.url);
  } finally {
    await server.close();
  }
  assert.equal(automatic.mode, "rebased");
  assert.equal(automatic.wire.snapshotUploaded, false);
  const offline = new LinearReplica(join(directory, "offline.db"), {
    device: "offline",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(offline);
  edit(authority, 1, "desktop-after-offline");
  authority.compact();
  const logsAfterGc = authority.db.prepare("SELECT count(*) AS n FROM _linear_commits").get().n;
  edit(offline, 2, "offline-B");
  const fallback = syncLinear(offline, authority);
  assert.equal(fallback.kind, "snapshot");
  assert.equal(fallback.mode, "rebased");
  syncLinear(mobile, authority);
  edit(mobile, 1, "mobile-choice");
  edit(authority, 1, "desktop-choice");
  const conflict = syncLinear(mobile, authority);
  assert.equal(conflict.mode, "conflict");
  const mobileCopy = authority.exportBranch(
    conflict.branchId,
    join(directory, "mobile-conflict.db")
  );
  const copy = new DatabaseSync(mobileCopy, { readOnly: true });
  let tables;
  try {
    tables = copy
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .get().n;
    assert.equal(
      copy.prepare("SELECT content FROM contents WHERE id=1").get().content,
      "mobile-choice"
    );
  } finally {
    copy.close();
  }
  const chosen = authority.chooseBranch(conflict.branchId, {
    expectedHead: authority.state().head,
  });
  authority.exportBranch(chosen.previous, join(directory, "desktop-before-choice.db"));
  syncLinear(mobile, authority);
  syncLinear(offline, authority);
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  assert.deepEqual(authority.snapshotRows(), offline.snapshotRows());
  edit(mobile, 2, "after-choice");
  assert.equal(syncLinear(mobile, authority).mode, "incremental");
  console.log(
    JSON.stringify(
      {
        protocol: 4,
        tables,
        automaticIndependentEdits: automatic.mode,
        normalWire: automatic.wire,
        fullSnapshotBytes,
        logsAfterGc,
        longOfflineMode: fallback.mode,
        longOfflineTransfer: fallback.kind,
        conflictBackup: conflict.mode,
        backupCopies: authority.branches().length,
        chosenContent: authority.rows("contents").find(row => row.id === 1).content,
        continuedAfterChoice: true,
        filesKept: keep
          ? { mobileCopy, desktopCopy: join(directory, "desktop-before-choice.db") }
          : null,
      },
      null,
      2
    )
  );
} finally {
  for (const peer of peers) peer.close();
  if (!keep) rmSync(directory, { recursive: true, force: true });
}
