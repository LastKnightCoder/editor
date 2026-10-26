import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  throw new Error("协议 2 网络同步超时");
};
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "tau-document-protocol-"));
  const server = await createServer({ dataDir, logger: false });
  await server.app.ready();
  cleanups.push(async () => {
    await server.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  const owner = server.store.register("作者"),
    row = server.store.create(owner.id, "baseline");
  const { id, contract } = await prepareContentContract("test", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const initial = await createNodeDocument(
    { documentId: row.id, epoch: 0, baselineId: "initial" },
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
  await server.store.publish(row.id, owner.id, Y.encodeStateAsUpdate(initial));
  initial.destroy();
  const headers = { authorization: `Bearer ${owner.id}:${owner.secret}` };
  return { ...server, owner, row, headers };
}

describe("真实服务发布与版本边界", () => {
  it("Node 导出使用当前备份格式，保留正文与协议且不附带迁移账本", async () => {
    const { store, row } = await setup();
    const target = join(store.config.dataDir, "export");
    execFileSync(process.execPath, [
      fileURLToPath(
        new URL("../../collaboration-cloudflare/scripts/export-node.mjs", import.meta.url)
      ),
      store.config.dataDir,
      target,
    ]);
    const metadata = JSON.parse(readFileSync(join(target, "metadata.json"), "utf8"));
    expect(metadata.format).toBe(5);
    expect(metadata.tables.collaboration_protocol).toHaveLength(1);
    expect(metadata.tables.collaboration_operations).toEqual([]);
    expect(metadata.tables).not.toHaveProperty("collaboration_migrations");
    expect(metadata.tables).not.toHaveProperty("identity_merges");
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, readFileSync(join(target, "documents", row.id)));
      expect(readNodeDocument(doc).title).toBe("原文");
    } finally {
      doc.destroy();
    }
  });
  it("结束共享拒绝过期保全修订，持久关闭回执防止迟到请求冒充同一份内容", async () => {
    const { app, store, owner, row, headers } = await setup();
    const previous = store.protocols.state(row.id).revision;
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
      const latest = store.protocols.state(row.id).revision;
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
      expect(store.protocols.state(room.id)).toMatchObject({
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

  it("新建协议 2 房间直接接纳 WebSocket 与 HTTP 并发增量，压缩后内容完整", async () => {
    const { app, store, owner, row, headers } = await setup();
    const initial = store.loadDocument(row.id);
    const state = Y.encodeStateAsUpdate(initial);
    initial.destroy();
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
    expect(() => store.ticket(owner.id, row.id)).toThrow();
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

  it("格式升级路由已退役，不创建迁移账本或改变当前文档", async () => {
    const { app, store, row, headers } = await setup();
    const before = store.protocols.state(row.id);
    for (const action of ["prepare", "freeze", "commit", "cancel"]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/documents/${row.id}/migrations/old/${action}`,
        headers,
        payload: { expectedEpoch: 0, expiresAt: Date.now() + 60000 },
      });
      expect(response.statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: "GET", url: `/v1/documents/${row.id}/migrations/old`, headers }))
        .statusCode
    ).toBe(404);
    expect(store.protocols.state(row.id)).toEqual(before);
    expect(
      store.db.prepare("SELECT name FROM sqlite_master WHERE name='collaboration_migrations'").get()
    ).toBeUndefined();
  });
});
