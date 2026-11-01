import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HybridReplica } from "./hybrid-replica.mjs";
import { serveLinear } from "./linear-transport.mjs";
import { synchronizeHybridHttp } from "./hybrid-transport.mjs";

const directory = mkdtempSync(join(tmpdir(), "tau-hybrid-evidence-"));
const peers = [];
const open = async (device, options = {}) => {
  const peer = await HybridReplica.open(join(directory, `${device}.db`), { device, ...options });
  peers.push(peer);
  return peer;
};
const text = peer =>
  peer
    .readNote(1)
    .content.flatMap(node => node.children ?? [])
    .map(node => node.text ?? "")
    .join("");
try {
  let authority = await open("desktop");
  await authority.createNote(1, "甲乙");
  let mobile = await open("mobile", { snapshot: authority.exportSnapshot() });
  const identity = mobile.readNote(1).identity;
  await authority.editNote(1, ({ tree, origin }) =>
    tree.insertText("paragraph-1", 0, "电脑", origin)
  );
  await mobile.editNote(1, ({ tree, origin }) => tree.insertText("paragraph-1", 2, "手机", origin));
  authority.close();
  mobile.close();
  authority = await open("desktop");
  mobile = await open("mobile");
  authority.compact();
  mobile.compact();
  mobile.db.exec("DELETE FROM _linear_ack_snapshot");
  const logsAfterGc = authority.db.prepare("SELECT count(*) AS n FROM _linear_commits").get().n;
  const server = await serveLinear(authority);
  let result;
  try {
    result = await synchronizeHybridHttp(mobile, server.url);
  } finally {
    await server.close();
  }
  assert.equal(text(mobile), "电脑甲乙手机");
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  assert.deepEqual(mobile.readNote(1).identity, identity);
  mobile.db.exec(
    "BEGIN; UPDATE _linear_state SET applying=2; UPDATE contents SET content='[]',count=0 WHERE id=1; UPDATE _linear_state SET applying=0; COMMIT"
  );
  const stateHash = mobile.entry(1).stateHash;
  mobile.close();
  mobile = await open("mobile");
  assert.equal(text(mobile), "电脑甲乙手机");
  assert.equal(mobile.entry(1).stateHash, stateHash);
  assert.notEqual(mobile.rows("contents")[0].content, "[]");
  console.log(
    JSON.stringify(
      {
        bodyModel: "existing-node-document-protocol-2",
        mergedText: text(mobile),
        identityPreserved: true,
        logsAfterGc,
        transfer: result.kind,
        stateHashesEqual: authority.entry(1).stateHash === mobile.entry(1).stateHash,
        outboxAfterAck: mobile.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get()
          .n,
        staleJsonRepairedOnRestart: true,
        libraryBackups: authority.branches().length,
        noteCopies: authority.copies().length,
        libraryChoiceRequired: result.libraryChoiceRequired,
        documentStateBytes: Buffer.from(mobile.entry(1).state, "base64").length,
        wire: result.wire,
      },
      null,
      2
    )
  );
} finally {
  for (const peer of peers) peer.close();
  rmSync(directory, { recursive: true, force: true });
}
