import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { expect, it } from "vitest";
import {
  captureScopedTextEdit,
  NodeTree,
  readNodeDocument,
  validateNodeDocument,
  type ScopedContentEdits,
} from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { createServer } from "./server";

const digest = (scope: ScopedContentEdits) =>
  createHash("sha256").update(JSON.stringify(scope)).digest("hex");

it("并发范围操作、人工增量、冲突重读、重复提交与落盘重载保留全部非目标内容", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "tau-scoped-pressure-"));
  let server = await createServer({
    dataDir,
    logger: false,
    maxDocumentsPerDevice: 16,
    globalRateLimit: 20000,
  });
  const rounds = process.env.TAU_SCOPED_STRESS === "1" ? 96 : 4;
  const documentCount = process.env.TAU_SCOPED_STRESS === "1" ? 8 : 2;
  const owner = server.store.register("作者");
  const outsider = server.store.register("非成员");
  const headers = { authorization: `Bearer ${owner.id}:${owner.secret}` };
  const originals = Array.from({ length: 12 }, (_, index) => ({
    type: "paragraph",
    collabId: `block-${index}`,
    children: [{ text: `前缀👩‍💻·${index}·甲·间隔·乙·结束` }],
  }));
  const fixture = await Promise.all(
    Array.from({ length: documentCount }, async (_, index) => {
      const { id } = server.store.create(owner.id, `scoped-${index}`);
      const doc = await createTestDocument(
        {
          title: "并发试验",
          bannerBg: "",
          bannerPosition: "center",
          content: originals,
        },
        { documentId: id, baselineId: "initial", epoch: 0 }
      );
      await server.store.publish(id, owner.id, Y.encodeStateAsUpdate(doc));
      doc.destroy();
      return {
        id,
        expected: readAndClose(id),
        lastRequest: undefined as { id: string; scope: ScopedContentEdits } | undefined,
      };
    })
  );
  function readAndClose(id: string) {
    const doc = server.store.loadDocument(id);
    try {
      return readNodeDocument(doc);
    } finally {
      doc.destroy();
    }
  }
  function submit(
    id: string,
    operationId: string,
    scope: ScopedContentEdits,
    expired = false,
    unauthorized = false
  ) {
    return server.app.inject({
      method: "POST",
      url: `/v1/documents/${id}/operations/${operationId}`,
      headers: unauthorized
        ? { authorization: `Bearer ${outsider.id}:${outsider.secret}` }
        : headers,
      payload: {
        kind: "scoped-edit",
        version: 2,
        baselineId: "initial",
        epoch: 0,
        expiresAt: expired ? 1 : 4_102_444_800_000,
        updateHash: digest(scope),
        scope,
      },
    });
  }
  // 正常请求的期限固定在首次请求，重放保持同一指纹。
  const deadline = Date.now() + 240_000;
  const post = (id: string, operationId: string, scope: ScopedContentEdits, expiresAt = deadline) =>
    server.app.inject({
      method: "POST",
      url: `/v1/documents/${id}/operations/${operationId}`,
      headers,
      payload: {
        kind: "scoped-edit",
        version: 2,
        baselineId: "initial",
        epoch: 0,
        expiresAt,
        updateHash: digest(scope),
        scope,
      },
    });
  try {
    for (let round = 0; round < rounds; round++) {
      await Promise.all(
        fixture.map(async entry => {
          const { id } = entry;
          const doc = server.store.loadDocument(id);
          const tree = new NodeTree(doc);
          const left = String(entry.expected.content[0].children![0].text);
          const right = String(entry.expected.content[1].children![0].text);
          const aText = round % 2 ? "甲" : "丙";
          const bText = round % 2 ? "乙" : "丁";
          const aAt = left.indexOf(round % 2 ? "丙" : "甲");
          const bAt = left.indexOf(round % 2 ? "丁" : "乙");
          const rightAt = right.indexOf(round % 2 ? "戊" : "甲");
          const rightText = round % 2 ? "甲" : "戊";
          const a = captureScopedTextEdit(tree, "a", "block-0", aAt, aAt + 1, aText);
          const b = captureScopedTextEdit(tree, "b", "block-0", bAt, bAt + 1, bText);
          const c = captureScopedTextEdit(tree, "c", "block-1", rightAt, rightAt + 1, rightText);
          const human = server.store.loadDocument(id);
          const humanTree = new NodeTree(human);
          try {
            const vector = Y.encodeStateVector(human);
            humanTree.insertText("block-2", 0, "人", null);
            const scope = {
              edits: [a],
              source: { proposalId: `proposal-${round}`, agentId: "润色" },
            };
            entry.lastRequest = { id: `a-${round}`, scope };
            const [first, replay, second, third] = await Promise.all([
              post(id, `a-${round}`, scope),
              post(id, `a-${round}`, scope),
              post(id, `b-${round}`, { edits: [b] }),
              post(id, `c-${round}`, { edits: [c] }),
              server.store.appendUpdate(id, owner.id, Y.encodeStateAsUpdate(human, vector), doc),
            ]);
            for (const result of [first, replay, second, third]) {
              expect(result.statusCode, result.body).toBe(200);
              expect(result.json().operation.state).toBe("COMMITTED");
            }
            entry.expected.content[0].children![0].text =
              left.slice(0, aAt) + aText + left.slice(aAt + 1, bAt) + bText + left.slice(bAt + 1);
            entry.expected.content[1].children![0].text =
              right.slice(0, rightAt) + rightText + right.slice(rightAt + 1);
            entry.expected.content[2].children![0].text =
              "人" + entry.expected.content[2].children![0].text;
            const sequence = server.store.operations.sequence(id);
            expect(sequence).toBe((round + 1) * 4);
            const rejected = await post(id, `stale-${round}`, { edits: [{ ...a, text: "损坏" }] });
            expect(rejected.json().operation).toMatchObject({
              state: "ABORTED",
              reason: "SCOPE_CONFLICT",
              conflicts: [{ opId: "a", blockId: "block-0" }],
            });
            expect(readAndClose(id)).toEqual(entry.expected);
            expect(server.store.operations.sequence(id)).toBe(sequence);
            if (round === 0) {
              expect((await submit(id, "unauthorized", scope, false, true)).statusCode).toBe(403);
              expect((await post(id, "expired", scope, 1)).json().operation.state).toBe("EXPIRED");
              expect(
                (await post(id, `a-${round}`, { edits: [{ ...a, text: "重复篡改" }] })).statusCode
              ).toBe(409);
            }
          } finally {
            humanTree.dispose();
            human.destroy();
            tree.dispose();
            doc.destroy();
          }
        })
      );
    }
    await server.app.close();
    server = await createServer({
      dataDir,
      logger: false,
      maxDocumentsPerDevice: 16,
      globalRateLimit: 20000,
    });
    for (const { id, expected, lastRequest } of fixture) {
      expect(readAndClose(id)).toEqual(expected);
      expect((await post(id, lastRequest!.id, lastRequest!.scope)).json().operation.state).toBe(
        "COMMITTED"
      );
      const reloaded = server.store.loadDocument(id);
      try {
        await validateNodeDocument(reloaded);
      } finally {
        reloaded.destroy();
      }
      expect(readAndClose(id)).toEqual(expected);
    }
    console.log(
      `范围编辑压力：${documentCount} 份文档，${documentCount * rounds * 6} 次并发写入、重放及冲突提交`
    );
  } finally {
    await server.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}, 180_000);
