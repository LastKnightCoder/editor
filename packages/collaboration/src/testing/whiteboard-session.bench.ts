import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import * as Y from "yjs";
import { canonicalContractJson, prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { WhiteboardModel } from "../whiteboard-model";
import { WHITEBOARD_LIMITS } from "../model-limits";

it("三端 3600 轮操作、乱序重复、删除撤销及 30 次重连保持身份与内容", async () => {
  const started = performance.now(),
    rssStart = process.memoryUsage().rss;
  const contract = await prepareWhiteboardContract("acceptance", {
    type: "acceptance.source",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
  });
  const base = new WhiteboardModel(new Y.Doc({ gc: false }));
  await base.installContracts({ [contract.id]: contract.contract });
  base.submit(
    Array.from({ length: 8 }, (_, index) => ({
      type: "create_page",
      id: "p" + index,
      title: "页" + index,
    })),
    null
  );
  base.submit(
    Array.from({ length: 128 }, (_, index) => ({
      type: "create",
      id: "n" + index,
      contractId: contract.id,
      data: { source: "" },
      geometry: { x: index, y: 0, width: 100, height: 30, rotation: 0 },
      parent: { kind: "page", id: "p" + (index % 8) },
    })),
    null
  );
  const seed = Y.encodeStateAsUpdate(base.doc);
  base.dispose();
  base.doc.destroy();
  const origins = [{}, {}, {}],
    peers: WhiteboardModel[] = [],
    histories: ReturnType<WhiteboardModel["createUndoManager"]>[] = [],
    pending: Uint8Array[] = [];
  const samples: number[] = [],
    checkpoints: { round: number; encodedBytes: number; rssBytes: number; history: number[] }[] =
      [];
  const open = async (index: number, state: Uint8Array) => {
    const doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc);
    expect((await model.receive(state)).status).toBe("applied");
    peers[index] = model;
    histories[index] = model.createUndoManager({
      trackedOrigins: new Set([origins[index]]),
      captureTimeout: 0,
    });
    doc.on("update", (update, _origin, _doc, transaction) => {
      if (transaction.local) pending.push(update);
    });
  };
  const synchronize = async () => {
    const updates = pending.splice(0);
    for (let client = 0; client < 3; client++) {
      const order = client % 2 ? updates : [...updates].reverse();
      for (const update of order) await peers[client].receive(update);
      for (const update of order.slice(-2)) await peers[client].receive(update);
    }
    expect(canonicalContractJson(peers[1].read())).toBe(canonicalContractJson(peers[0].read()));
    expect(canonicalContractJson(peers[2].read())).toBe(canonicalContractJson(peers[0].read()));
  };
  try {
    for (let index = 0; index < 3; index++) await open(index, seed);
    const bindings = peers[0]
      .read()
      .pages.flatMap(page => page.children)
      .map(node => [node.id, node.fieldBindings] as const);
    for (let round = 0; round < 3600; round++) {
      const client = round % 3,
        model = peers[client],
        id = "n" + (round % 128),
        start = performance.now();
      model.submit(
        [
          { type: "move_node", id, parent: { kind: "page", id: "p" + ((round + client) % 8) } },
          { type: "set_data", id, patch: { ["client" + client]: round } },
        ],
        origins[client]
      );
      model.submit(
        [
          {
            type: "edit_text",
            id,
            field: "source",
            edit: { offset: 0, remove: 0, text: ["甲", "乙", "😀"][client] },
          },
        ],
        origins[client]
      );
      samples.push(performance.now() - start);
      if ((round + 1) % 30 === 0) await synchronize();
      if ((round + 1) % 120 === 0) {
        const target = "n127";
        for (const index of [0, 1])
          peers[index].submit([{ type: "remove_nodes", ids: [target] }], origins[index]);
        await synchronize();
        histories[0].undo();
        await synchronize();
        expect(
          peers[0]
            .read()
            .pages.flatMap(page => page.children)
            .some(node => node.id === target)
        ).toBe(false);
        histories[1].undo();
        await synchronize();
        expect(
          peers[0]
            .read()
            .pages.flatMap(page => page.children)
            .some(node => node.id === target)
        ).toBe(true);
        const state = Y.encodeStateAsUpdate(peers[2].doc);
        histories[2].destroy();
        peers[2].dispose();
        peers[2].doc.destroy();
        await open(2, state);
      }
      if ((round + 1) % 300 === 0) {
        const encodedBytes = Y.encodeStateAsUpdate(peers[0].doc).byteLength;
        expect(encodedBytes).toBeLessThanOrEqual(WHITEBOARD_LIMITS.documentBytes);
        checkpoints.push({
          round: round + 1,
          encodedBytes,
          rssBytes: process.memoryUsage().rss,
          history: histories.map(history => history.undoStack.length),
        });
        console.info(
          "WHITEBOARD_PROGRESS " +
            JSON.stringify({
              round: round + 1,
              elapsedMs: performance.now() - started,
              encodedBytes,
            })
        );
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    }
    await synchronize();
    const nodes = peers[0].read().pages.flatMap(page => page.children);
    expect(nodes).toHaveLength(128);
    expect(new Set(nodes.map(node => node.id)).size).toBe(128);
    const lookup = new Map(bindings);
    for (const node of nodes) expect(node.fieldBindings).toEqual(lookup.get(node.id));
    expect(
      nodes.reduce((count, node) => count + Array.from(String(node.data.source)).length, 0)
    ).toBe(3600);
    const before = Y.encodeStateAsUpdate(peers[0].doc);
    histories.forEach(history => history.clear());
    expect(
      Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(peers[0].doc)), Buffer.from(before))
    ).toBe(0);
    expect(
      histories.every(history => history.undoStack.length === 0 && history.redoStack.length === 0)
    ).toBe(true);
    const sorted = samples.slice().sort((a, b) => a - b);
    console.info(
      "WHITEBOARD_MEASURE " +
        JSON.stringify({
          name: "long-session",
          clients: 3,
          rounds: 3600,
          transactions: 7200,
          reconnects: 30,
          duplicateDelivery: true,
          durationMs: performance.now() - started,
          p50RoundMs: sorted[1800],
          p95RoundMs: sorted[3420],
          rssStart,
          rssEnd: process.memoryUsage().rss,
          checkpoints,
        })
    );
  } finally {
    histories.forEach(history => history.destroy());
    peers.forEach(model => {
      model.dispose();
      model.doc.destroy();
    });
  }
});
