// @vitest-environment node
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { afterAll, beforeAll, expect, it } from "vitest";
import { candidateWorkerFixture } from "../../__tests__/insight-candidate-worker-fixture";
import { WhiteboardAppendWorker } from "../append-worker";
import type { AppendInput } from "../prepare-append";

let fixture: Awaited<ReturnType<typeof candidateWorkerFixture>>;
beforeAll(async () => {
  fixture = await candidateWorkerFixture("src-electron/main/workers/whiteboard-append.worker.ts");
}, 30000);
afterAll(async () => {
  await fixture.dispose();
});

function input() {
  const doc = new Y.Doc({ gc: false });
  const model = new WhiteboardModel(doc);
  model.submit([{ type: "create_page", id: "page", title: "页面" }], null);
  const state = Y.encodeStateAsUpdate(doc),
    vector = Y.encodeStateVector(doc);
  model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "甲" } }], null);
  const request: AppendInput = {
    identity: {
      databaseName: "data.db",
      documentId: "document",
      sourceId: "source",
      baselineId: "baseline",
      epoch: 1,
    },
    revision: 2,
    state,
    update: Y.encodeStateAsUpdate(doc, vector),
  };
  model.dispose();
  doc.destroy();
  return request;
}

it("复用线程的多次校验保留本次状态并拒绝并行提交", async () => {
  const worker = new WhiteboardAppendWorker(fixture.workerPath);
  const request = input();
  try {
    const first = worker.prepare(request);
    await expect(worker.prepare(request)).rejects.toThrow("串行");
    const accepted = await first;
    const doc = new Y.Doc({ gc: false });
    const model = new WhiteboardModel(doc);
    try {
      Y.applyUpdate(doc, accepted.projection.state);
      expect(model.readSummary().title).toBe("甲");
      const vector = Y.encodeStateVector(doc);
      model.submit([{ type: "edit_title", edit: { offset: 1, remove: 0, text: "乙" } }], null);
      const next = await worker.prepare({
        ...request,
        state: accepted.projection.state,
        revision: 3,
        update: Y.encodeStateAsUpdate(doc, vector),
      });
      const verifiedDoc = new Y.Doc({ gc: false });
      const verified = new WhiteboardModel(verifiedDoc);
      try {
        Y.applyUpdate(verifiedDoc, next.projection.state);
        expect(verified.readSummary().title).toBe("甲乙");
      } finally {
        verified.dispose();
        verifiedDoc.destroy();
      }
    } finally {
      model.dispose();
      doc.destroy();
    }
  } finally {
    await worker.dispose();
  }
});

it("一次校验失败不污染下一次候选，关闭后不再接受提交", async () => {
  const worker = new WhiteboardAppendWorker(fixture.workerPath);
  try {
    await expect(worker.prepare({ ...input(), state: Uint8Array.from([255]) })).rejects.toThrow();
    const accepted = await worker.prepare(input());
    expect(accepted.projection.title).toBe("甲");
  } finally {
    await worker.dispose();
  }
  await expect(worker.prepare(input())).rejects.toThrow("关闭");
});
