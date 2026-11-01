import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { HistoryReplica, openCheckpoint } from "./history-replica.mjs";
import { exchange } from "./replica.mjs";
import { serveHistory, recoverOverHttp } from "./history-transport.mjs";

const directory = mkdtempSync(join(tmpdir(), "tau-history-evidence-"));
const peers = [];
const put = (peer, key, value) =>
  peer.transaction(db =>
    db
      .prepare(
        "INSERT INTO plugin_kv VALUES('spike',?,?,1) ON CONFLICT(plugin_id,key) DO UPDATE SET value=excluded.value"
      )
      .run(key, value)
  );
const sizes = peer => ({
  batches: peer.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n,
  versions: peer.db.prepare("SELECT count(*) AS n FROM _spike_versions").get().n,
  chunks: peer.db.prepare("SELECT count(*) AS n FROM _spike_chunks").get().n,
  chunkBytes: peer.db.prepare("SELECT coalesce(sum(length(data)),0) AS n FROM _spike_chunks").get()
    .n,
  receipts: peer.db.prepare("SELECT count(*) AS n FROM _spike_receipts").get().n,
});
try {
  for (const [slot, device] of ["desktop", "mobile", "laptop"].entries())
    peers.push(
      new HistoryReplica(join(directory, `${device}.db`), {
        device,
        slot: slot + 1,
        baseline: peers[0]?.initialBaseline(),
      })
    );
  const [authority, mobile, laptop] = peers;
  authority.register(mobile);
  authority.register(laptop);
  for (let index = 0; index < 40; index++)
    put(authority, "history", randomBytes(12 * 1024).toString("base64"));
  put(authority, "deleted", "before");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(laptop, "offline-new", "safe-new");
  put(laptop, "deleted", "offline-conflict");
  authority.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='deleted'").run());
  exchange(authority, mobile);
  authority.retire(laptop);
  const before = sizes(authority);
  const checkpoint = authority.createCheckpoint();
  mobile.installCheckpoint(checkpoint);
  authority.acknowledge(mobile);
  authority.compact();
  const after = sizes(authority);
  const server = await serveHistory(authority, { dropReplyOnce: true });
  try {
    await assert.rejects(recoverOverHttp(laptop, server.url));
    await recoverOverHttp(laptop, server.url);
  } finally {
    await server.close();
  }
  assert.deepEqual(authority.replicatedSnapshot(), laptop.replicatedSnapshot());
  console.log(
    JSON.stringify(
      {
        protocol: 3,
        contracts: authority.contracts.length,
        storageAdapters: authority.contracts.filter(rule => rule.adapter).length,
        blockedReplicatedTables: authority.contracts.filter(
          rule => rule.scope === "replicated" && !rule.adapter
        ).length,
        contractScopes: Object.fromEntries(
          Object.entries(Object.groupBy(authority.contracts, rule => rule.scope)).map(
            ([scope, rules]) => [scope, rules.length]
          )
        ),
        before,
        after,
        checkpointBytes: Buffer.byteLength(checkpoint.body),
        keptVersions: openCheckpoint(checkpoint).versions.length,
        recoveredNewValue: laptop.rows("plugin_kv").find(row => row.key === "offline-new").value,
        preservedBranches: laptop.recoveryBranches().length,
        oldDeletedValueRevived: laptop.rows("plugin_kv").some(row => row.key === "deleted"),
        newActor: laptop.state.device,
        replicatedTablesEqual: true,
      },
      null,
      2
    )
  );
} finally {
  for (const peer of peers) peer.close();
  rmSync(directory, { recursive: true, force: true });
}
