import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTree } from "./node-tree";
import { readNodeDocument } from "./node-document";
import { buildDocumentHistoryUpdate } from "./document-history-edit";
import {
  commitHistoryFixture,
  historyDocument,
  historyRevision,
  openHistoryFixture,
} from "./testing/document-history";

describe.runIf(process.env.TAU_DOCUMENT_HISTORY_STRESS === "1")("文档编辑历史压力", () => {
  it("长文档交错提交、重复送达、压缩后重开和任意版本回放", async () => {
    const path = mkdtempSync(join(tmpdir(), "tau-document-history-"));
    const file = join(path, "history.db");
    let store = openHistoryFixture(file);
    const { doc, tree, id } = await historyDocument(1000, "多段正文与并发编辑。".repeat(8));
    const peers = Array.from({ length: 4 }, () => {
      const peer = new Y.Doc({ gc: false });
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      return new NodeTree(peer);
    });
    try {
      store.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
      const started = performance.now();
      let elapsed = 0;
      const baseSize = Y.encodeStateAsUpdate(doc).byteLength;
      const rounds = 250;
      const restorePoints = new Map<number, string>();
      for (let round = 0; round < rounds; round++) {
        const operations = peers.map((peer, index) => {
          const previous = Y.encodeStateVector(peer.doc);
          const block = (round * 7 + index) % 1000;
          peer.insertText(`block-${block}`, 0, `${round}/${index} `, null);
          return Y.encodeStateAsUpdate(peer.doc, previous);
        });
        const previous = Y.encodeStateVector(doc);
        store.db.exec("BEGIN IMMEDIATE");
        for (const [index, update] of operations.entries()) {
          const operation = `${round}-${index}`,
            actor = `writer-${index}`;
          commitHistoryFixture(
            store.history,
            doc,
            operation,
            () => Y.applyUpdate(doc, update),
            actor
          );
          commitHistoryFixture(
            store.history,
            doc,
            operation,
            () => Y.applyUpdate(doc, update),
            actor
          );
        }
        store.db.exec("COMMIT");
        const delta = Y.encodeStateAsUpdate(doc, previous);
        for (const peer of peers) Y.applyUpdate(peer.doc, delta);
        if (round % 23 === 0 || round === rounds - 1)
          restorePoints.set(
            (round + 1) * peers.length,
            historyRevision(Y.encodeStateAsUpdate(doc))
          );
      }
      elapsed = performance.now() - started;
      store.db.close();
      store = openHistoryFixture(file);
      const head = store.history.head(id);
      expect(head?.sequence).toBe(rounds * peers.length);
      const seen = new Set<string>();
      let before: number | undefined;
      for (;;) {
        const page = store.history.list(id, before);
        if (!page.length) break;
        for (const row of page) seen.add(row.operationId);
        before = page.at(-1)?.sequence;
      }
      expect(seen.size).toBe(rounds * peers.length + 1);
      const replayStart = performance.now();
      for (const [sequence, revision] of restorePoints) {
        const historical = store.history.replay(id, sequence);
        try {
          expect(historyRevision(Y.encodeStateAsUpdate(historical))).toBe(revision);
        } finally {
          historical.destroy();
        }
      }
      const replayMs = performance.now() - replayStart;
      const lastSequence = rounds * peers.length;
      const restore = await buildDocumentHistoryUpdate(
        store.history,
        id,
        doc,
        {
          kind: "restore",
          operationId: "restore",
          sequence: 0,
          expectedRevision: historyRevision(Y.encodeStateAsUpdate(doc)),
        },
        historyRevision(Y.encodeStateAsUpdate(doc)),
        "writer-0",
        true
      );
      commitHistoryFixture(
        store.history,
        doc,
        "restore",
        () => Y.applyUpdate(doc, restore),
        "writer-0",
        { kind: "restore", target: 0 }
      );
      expect(readNodeDocument(doc).content[999].children?.[0].text).toBe(
        "多段正文与并发编辑。".repeat(8)
      );
      expect(store.history.list(id)[0]).toMatchObject({
        kind: "restore",
        sequence: lastSequence + 1,
      });
      const usage = store.db
        .prepare("SELECT sum(length(state)) AS bytes FROM document_history_payloads")
        .get();
      console.log({
        edits: lastSequence,
        peers: peers.length,
        blocks: 1000,
        baseSize,
        bytes: usage?.bytes,
        writeMs: Math.round(elapsed),
        replayCount: restorePoints.size,
        replayMs: Math.round(replayMs),
      });
    } finally {
      store.db.close();
      for (const peer of peers) {
        peer.dispose();
        peer.doc.destroy();
      }
      tree.dispose();
      doc.destroy();
      rmSync(path, { recursive: true, force: true });
    }
  }, 120_000);
});
