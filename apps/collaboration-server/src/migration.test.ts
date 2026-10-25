import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { WebSocket } from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { createNodeDocument, NodeTree, readNodeDocument } from "@tau/collaboration";
import { prepareContentContract } from "../../../packages/db-schema/content-contracts";
import { createServer } from "./server";

const cleanups: (() => Promise<void>)[] = [];
const until = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("新协议网络同步超时");
};
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "tau-migration-api-"));
  const server = await createServer({ dataDir, logger: false });
  await server.app.ready();
  cleanups.push(async () => {
    await server.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  const owner = server.store.register("作者"),
    row = server.store.create(owner.id, "baseline");
  const initial = createSharedDocument({
    title: "原文",
    content: [{ type: "paragraph", children: [{ text: "甲乙" }] }],
    bannerBg: "",
    bannerPosition: "center",
  });
  server.store.publish(row.id, owner.id, Y.encodeStateAsUpdate(initial));
  initial.destroy();
  const headers = { authorization: `Bearer ${owner.id}:${owner.secret}` };
  const invoke = (action: string, payload: Record<string, unknown> = {}) =>
    server.app.inject({
      method: "POST",
      url: `/v1/documents/${row.id}/migrations/operation/${action}`,
      headers,
      payload,
    });
  const { id, contract } = await prepareContentContract("test", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const candidate = await createNodeDocument(
    { documentId: row.id, epoch: 1, baselineId: "new" },
    {
      title: "原文",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "A", tauContract: id, children: [{ text: "甲乙" }] },
      ],
    },
    { [id]: contract }
  );
  cleanups.push(async () => candidate.destroy());
  return { ...server, owner, row, candidate, invoke, headers };
}

describe("真实服务迁移入口", () => {
  it("结束共享拒绝过期保全修订，持久关闭回执防止迟到请求冒充同一份内容", async () => {
    const { app, store, owner, row, headers } = await setup();
    const previous = store.migrations.state(row.id).revision;
    const doc = store.loadDocument(row.id);
    try {
      const before = Y.encodeStateVector(doc);
      doc.getText("title").insert(0, "远端新增");
      const current = store.loadDocument(row.id);
      try {
        await store.appendUpdate(row.id, owner.id, Y.encodeStateAsUpdate(doc, before), current);
      } finally {
        current.destroy();
      }
      const latest = store.migrations.state(row.id).revision;
      const close = (expectedRevision: string) =>
        app.inject({
          method: "POST",
          url: `/v1/documents/${row.id}/close`,
          headers,
          payload: { expectedRevision },
        });
      expect((await close(previous)).statusCode).toBe(409);
      expect(store.document(row.id).status).toBe("active");
      expect((await close(latest)).json()).toEqual({ ok: true, revision: latest });
      expect((await close(latest)).statusCode).toBe(200);
      expect((await close(previous)).statusCode).toBe(409);
    } finally {
      doc.destroy();
    }
  });
  it("新房间直接发布协议 2，自定义源码和同名业务字段保留，重复发布不覆盖后续编辑", async () => {
    const { app, store, owner, headers } = await setup();
    const room = store.create(owner.id, "new-format");
    const definition = await prepareContentContract("example", {
      type: "example.source",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["script"] },
    });
    const doc = await createNodeDocument(
      { documentId: room.id, baselineId: "initial", epoch: 0 },
      {
        title: "直接发布",
        bannerBg: "",
        bannerPosition: "center",
        content: [
          {
            type: "example.source",
            collabId: "source",
            tauContract: definition.id,
            script: "初始",
            svg: "tau-collab-asset:不是资源声明",
            isFold: true,
            children: [{ text: "" }],
          },
        ],
      },
      { [definition.id]: definition.contract }
    );
    try {
      const state = Y.encodeStateAsUpdate(doc);
      const published = await app.inject({
        method: "POST",
        url: `/v1/documents/${room.id}/publish`,
        headers,
        payload: { state: Buffer.from(state).toString("base64") },
      });
      expect(published.statusCode).toBe(200);
      expect(published.json()).toEqual({ documentId: room.id, published: true });
      expect(store.migrations.state(room.id)).toMatchObject({
        version: 2,
        epoch: 0,
        baselineId: "initial",
      });
      const current = store.loadDocument(room.id),
        tree = new NodeTree(doc);
      try {
        const before = Y.encodeStateVector(doc);
        tree.textField("source", "script").insert(2, "追加");
        await store.appendUpdate(room.id, owner.id, Y.encodeStateAsUpdate(doc, before), current);
        await store.publish(room.id, owner.id, state);
        const loaded = store.loadDocument(room.id);
        try {
          expect(readNodeDocument(loaded).content[0]).toMatchObject({
            script: "初始追加",
            svg: "tau-collab-asset:不是资源声明",
            isFold: true,
          });
        } finally {
          loaded.destroy();
        }
      } finally {
        current.destroy();
        tree.dispose();
      }
      expect(() => store.ticket(owner.id, room.id)).toThrow();
      expect(typeof store.ticket(owner.id, room.id, 2)).toBe("string");
    } finally {
      doc.destroy();
    }
  });

  it("首次发布不同基线并发竞争只有一个生效，错误文档身份不能激活草稿", async () => {
    const { store, owner } = await setup();
    const room = store.create(owner.id, "racing-baselines");
    const content = { title: "初始", bannerBg: "", bannerPosition: "center", content: [] };
    const docs = await Promise.all(
      ["first", "second"].map(baselineId =>
        createNodeDocument({ documentId: room.id, baselineId, epoch: 0 }, content, {})
      )
    );
    try {
      const results = await Promise.allSettled(
        docs.map(doc => store.publish(room.id, owner.id, Y.encodeStateAsUpdate(doc)))
      );
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
      const other = store.create(owner.id, "wrong-room");
      await expect(
        store.publish(other.id, owner.id, Y.encodeStateAsUpdate(docs[0]))
      ).rejects.toThrow();
      expect(store.document(other.id).status).toBe("draft");
    } finally {
      docs.forEach(doc => doc.destroy());
    }
  });

  it("冻结、提交、回执重试与旧票据隔离贯通，迁移后接受并发增量", async () => {
    const { app, store, owner, row, candidate, invoke, headers } = await setup();
    const oldTicket = store.ticket(owner.id, row.id);
    expect(
      (await invoke("prepare", { expectedEpoch: 0, expiresAt: Date.now() + 60_000 })).statusCode
    ).toBe(200);
    const frozen = (await invoke("freeze")).json().operation;
    const state = Y.encodeStateAsUpdate(candidate);
    const payload = {
      expectedRevision: frozen.frozenRevision,
      targetVersion: 2,
      baselineId: "new",
      candidateHash: createHash("sha256").update(state).digest("hex"),
      state: Buffer.from(state).toString("base64"),
    };
    const committed = await invoke("commit", payload);
    expect(committed.statusCode).toBe(200);
    expect(committed.json().operation.state).toBe("COMMITTED");
    expect(
      (await app.inject({ method: "GET", url: `/v1/documents/${row.id}/state`, headers }))
        .statusCode
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/documents/${row.id}/state`,
          headers: { ...headers, "x-tau-document-version": "2" },
        })
      ).statusCode
    ).toBe(200);
    expect((await invoke("commit", payload)).json()).toEqual(committed.json());
    expect((await invoke("cancel", { expectedEpoch: 0 })).json()).toEqual(committed.json());
    expect(() => store.verifyTicket(oldTicket, row.id)).toThrow("旧文档基线");
    const incompatible = await app.inject({
      method: "POST",
      url: "/v1/tickets",
      headers,
      payload: { documentId: row.id },
    });
    expect(incompatible.statusCode).toBe(409);
    const ticket = store.ticket(owner.id, row.id, 2);
    expect(store.verifyTicket(ticket, row.id).id).toBe(owner.id);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("测试监听失败");
    const clients = [0, 1].map(() => {
      const tree = new NodeTree(new Y.Doc());
      const socket = new HocuspocusProviderWebsocket({
        url: `ws://127.0.0.1:${address.port}/ws`,
        WebSocketPolyfill: WebSocket,
      });
      const provider = new HocuspocusProvider({
        name: row.id,
        document: tree.doc,
        websocketProvider: socket,
        token: () => store.ticket(owner.id, row.id, 2),
      });
      provider.attach();
      cleanups.push(async () => {
        provider.destroy();
        socket.destroy();
        tree.doc.destroy();
      });
      return { tree, provider };
    });
    await until(() => clients.every(client => client.provider.synced));
    clients[0].tree.insertText("A", 0, "网", {});
    clients[1].tree.insertText("A", 2, "络", {});
    await until(() =>
      clients.every(
        client =>
          !client.provider.hasUnsyncedChanges &&
          client.tree.content("A").toString().includes("网") &&
          client.tree.content("A").toString().includes("络")
      )
    );
    expect(clients[0].tree.read()).toEqual(clients[1].tree.read());
    const current = store.loadDocument(row.id),
      left = new NodeTree(new Y.Doc()),
      right = new NodeTree(new Y.Doc());
    try {
      Y.applyUpdate(left.doc, state);
      Y.applyUpdate(right.doc, state);
      left.insertText("A", 1, "左", {});
      right.insertText("A", 2, "右", {});
      await Promise.all([
        store.appendUpdate(row.id, owner.id, Y.encodeStateAsUpdate(left.doc), current),
        store.appendUpdate(row.id, owner.id, Y.encodeStateAsUpdate(right.doc), current),
      ]);
      store.compact(row.id);
      const recovered = store.loadDocument(row.id);
      try {
        const text = String(readNodeDocument(recovered).content[0].children?.[0].text);
        expect(text.replace(/[网络]/g, "")).toBe("甲左乙右");
        expect(
          [...text].filter(character => character === "网" || character === "络")
        ).toHaveLength(2);
      } finally {
        recovered.destroy();
      }
    } finally {
      current.destroy();
      left.doc.destroy();
      right.doc.destroy();
    }
  });

  it("取消先胜后迟到候选不会覆盖原房间", async () => {
    const { store, row, candidate, invoke } = await setup();
    await invoke("prepare", { expectedEpoch: 0, expiresAt: Date.now() + 60_000 });
    const frozen = (await invoke("freeze")).json().operation;
    expect((await invoke("cancel", { expectedEpoch: 0 })).json().operation.state).toBe("ABORTED");
    const state = Y.encodeStateAsUpdate(candidate);
    const response = await invoke("commit", {
      expectedRevision: frozen.frozenRevision,
      targetVersion: 2,
      baselineId: "new",
      candidateHash: createHash("sha256").update(state).digest("hex"),
      state: Buffer.from(state).toString("base64"),
    });
    expect(response.json().operation.state).toBe("ABORTED");
    expect(store.migrations.state(row.id)).toMatchObject({ version: 1, epoch: 0 });
  });
});
