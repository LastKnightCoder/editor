import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { WhiteboardModel } from "../whiteboard-model";
import { WHITEBOARD_LIMITS } from "../model-limits";
import type { WhiteboardModelCommand } from "../whiteboard-types";
const geometry = { x: 0, y: 0, width: 100, height: 40, rotation: 0 };
const stats = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    samples: values.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    maxMs: sorted.at(-1),
  };
};
const sample = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};
const output = (name: string, values: object) =>
  console.info("WHITEBOARD_MEASURE " + JSON.stringify({ name, ...values }));

describe("白板容量验收（单进程测量，不代表界面帧率）", () => {
  it("64 页和 5000 元素的移动、接收、重开与跨界拒绝", async () => {
    const doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc),
      peerDoc = new Y.Doc({ gc: false }),
      peer = new WhiteboardModel(peerDoc);
    try {
      const contract = await prepareWhiteboardContract("acceptance", {
        type: "acceptance.shape",
        dataVersion: 1,
      });
      await model.installContracts({ [contract.id]: contract.contract });
      const pages = Array.from({ length: WHITEBOARD_LIMITS.pages }, (_, index) => "page-" + index);
      model.submit(
        pages.map(id => ({ type: "create_page", id, title: id })),
        null
      );
      const building = performance.now();
      for (let index = 0; index < WHITEBOARD_LIMITS.elements; index += 256)
        model.submit(
          Array.from(
            { length: Math.min(256, WHITEBOARD_LIMITS.elements - index) },
            (_, offset) => ({
              type: "create",
              id: "node-" + (index + offset),
              contractId: contract.id,
              geometry,
              data: { label: "中文🙂" },
              parent: { kind: "page", id: pages[(index + offset) % pages.length] },
            })
          ),
          null
        );
      const buildMs = performance.now() - building,
        state = Y.encodeStateAsUpdate(doc);
      expect(model.pages.size).toBe(64);
      expect(model.elements.size).toBe(5000);
      const receiving = performance.now();
      expect((await peer.receive(state)).status).toBe("applied");
      const receiveMs = performance.now() - receiving;
      expect(JSON.stringify(peer.read())).toBe(JSON.stringify(model.read()));
      const moves: number[] = [],
        reads: number[] = [];
      for (let index = 0; index < 32; index++) {
        moves.push(
          sample(() =>
            model.submit(
              [
                {
                  type: "move_node",
                  id: "node-" + index,
                  parent: { kind: "page", id: pages[(index + 1) % pages.length] },
                },
              ],
              null
            )
          )
        );
        reads.push(sample(() => model.read()));
      }
      const before = Y.encodeStateAsUpdate(doc);
      expect(() =>
        model.submit(
          [
            {
              type: "create",
              id: "overflow",
              contractId: contract.id,
              geometry,
              data: {},
              parent: { kind: "page", id: pages[0] },
            },
          ],
          null
        )
      ).toThrow("预算");
      expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(doc)), Buffer.from(before))).toBe(0);
      expect((await peer.receive(before)).status).toBe("applied");
      expect(JSON.stringify(peer.read())).toBe(JSON.stringify(model.read()));
      output("pages-elements", {
        pages: 64,
        elements: 5000,
        buildMs,
        receiveMs,
        encodedBytes: before.byteLength,
        move: stats(moves),
        projection: stats(reads),
        rssBytes: process.memoryUsage().rss,
      });
    } finally {
      model.dispose();
      peer.dispose();
      doc.destroy();
      peerDoc.destroy();
    }
  });
  it("1024 个独立富文本根按真实模型接收与拒绝超限", async () => {
    const doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc),
      peerDoc = new Y.Doc({ gc: false }),
      peer = new WhiteboardModel(peerDoc);
    try {
      const contract = await prepareWhiteboardContract("acceptance", {
        type: "acceptance.rich",
        dataVersion: 1,
        structure: { text: "richtext" },
      });
      await model.installContracts({ [contract.id]: contract.contract });
      model.submit([{ type: "create_page", id: "page", title: "根" }], null);
      const start = performance.now();
      for (let base = 0; base < 1024; base += 256)
        model.submit(
          Array.from({ length: 256 }, (_, index) => ({
            type: "create",
            id: "rich-" + (base + index),
            contractId: contract.id,
            data: {},
            geometry,
            parent: { kind: "page", id: "page" },
          })),
          null
        );
      const state = Y.encodeStateAsUpdate(doc),
        buildMs = performance.now() - start;
      const receiving = performance.now();
      expect((await peer.receive(state)).status).toBe("applied");
      const receiveMs = performance.now() - receiving;
      expect(JSON.stringify(peer.read())).toBe(JSON.stringify(model.read()));
      expect(() =>
        model.submit(
          [
            {
              type: "create",
              contractId: contract.id,
              geometry,
              data: {},
              parent: { kind: "page", id: "page" },
            },
          ],
          null
        )
      ).toThrow("预算");
      expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(doc)), Buffer.from(state))).toBe(0);
      output("richtext-roots", {
        roots: 1024,
        buildMs,
        receiveMs,
        encodedBytes: state.byteLength,
        rssBytes: process.memoryUsage().rss,
      });
    } finally {
      model.dispose();
      peer.dispose();
      doc.destroy();
      peerDoc.destroy();
    }
  });
  it("长文本历史增长触发 8 MiB 门禁时保持最后确认状态", async () => {
    const doc = new Y.Doc({ gc: false }),
      model = new WhiteboardModel(doc);
    try {
      model.submit([{ type: "create_page", id: "page", title: "容量" }], null);
      const text = "汉🙂".repeat(60_000),
        latencies: number[] = [];
      let accepted = 0,
        rejected = false,
        last = Y.encodeStateAsUpdate(doc);
      for (let round = 0; round < 40; round++) {
        const command: WhiteboardModelCommand = {
          type: "edit_title",
          edit: { offset: model.title.length, remove: 0, text },
        };
        try {
          latencies.push(sample(() => model.submit([command], null)));
          accepted++;
          last = Y.encodeStateAsUpdate(doc);
        } catch (error) {
          expect(String(error)).toContain("预算");
          expect(Buffer.compare(Buffer.from(Y.encodeStateAsUpdate(doc)), Buffer.from(last))).toBe(
            0
          );
          rejected = true;
          break;
        }
      }
      expect(rejected).toBe(true);
      expect(accepted).toBeGreaterThan(0);
      expect(last.byteLength).toBeLessThanOrEqual(WHITEBOARD_LIMITS.documentBytes);
      expect(model.title.toString()).toBe(text.repeat(accepted));
      output("document-bytes", {
        accepted,
        rejected,
        encodedBytes: last.byteLength,
        latency: stats(latencies),
        rssBytes: process.memoryUsage().rss,
      });
    } finally {
      model.dispose();
      doc.destroy();
    }
  });
});
