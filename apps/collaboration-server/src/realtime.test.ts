import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { WebSocket } from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { readNodeDocument, replaceText } from "@tau/collaboration";
import { createServer } from "./server";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("实时同步等待超时");
};

describe("真实 WebSocket 协作", () => {
  it("同一设备反复关闭并重开时保留每次连接的编辑版本", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-history-reconnect-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const server = await createServer({ dataDir: directory, logger: false });
    await server.app.listen({ host: "127.0.0.1", port: 0 });
    cleanup.push(() => server.app.close());
    const address = server.app.server.address();
    if (!address || typeof address === "string") throw new Error("监听失败");
    const owner = server.store.register("作者");
    const room = server.store.create(owner.id, "history-reconnect");
    const seed = await createTestDocument(
      { title: "原文", content: [], bannerBg: "", bannerPosition: "center" },
      { documentId: room.id, baselineId: "base", epoch: 0 }
    );
    await server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(seed));
    seed.destroy();
    let expected = "原文";
    const versions: { sequence: number; title: string }[] = [];
    for (const word of ["甲", "乙", "丙", "丁"]) {
      const document = new Y.Doc();
      const socket = new HocuspocusProviderWebsocket({
        url: `ws://127.0.0.1:${address.port}/ws`,
        WebSocketPolyfill: WebSocket,
      });
      const provider = new HocuspocusProvider({
        name: room.id,
        document,
        websocketProvider: socket,
        token: () => server.store.ticket(owner.id, room.id, 2),
      });
      try {
        provider.attach();
        await vi.waitFor(() => expect(provider.synced).toBe(true));
        expect(document.getText("title").toString()).toBe(expected);
        document.getText("title").insert(0, word);
        expected = word + expected;
        await vi.waitFor(() => expect(provider.hasUnsyncedChanges).toBe(false));
        const entry = server.store.history.list(room.id)[0];
        versions.push({ sequence: entry.sequence, title: expected });
      } finally {
        provider.destroy();
        socket.destroy();
        document.destroy();
      }
      await vi.waitFor(() =>
        expect(server.hocuspocus.documents.get(room.id)?.getConnections().length ?? 0).toBe(0)
      );
    }
    for (const version of versions) {
      const historical = server.store.history.replay(room.id, version.sequence);
      try {
        expect(historical.getText("title").toString()).toBe(version.title);
      } finally {
        historical.destroy();
      }
    }
  });

  it("50 个连接在 5 份内容中分别收敛", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-load-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const server = await createServer({ dataDir: directory, logger: false });
    await server.app.listen({ host: "127.0.0.1", port: 0 });
    cleanup.push(() => server.app.close());
    const address = server.app.server.address();
    if (!address || typeof address === "string") throw new Error("监听失败");
    const groups: { document: Y.Doc; provider: HocuspocusProvider }[][] = [];
    for (let groupIndex = 0; groupIndex < 5; groupIndex++) {
      const owner = server.store.register(`创建者 ${groupIndex}`);
      const room = server.store.create(owner.id, "load");
      const seed = await createTestDocument(
        {
          title: "",
          content: [{ type: "paragraph", children: [{ text: "内容" }] }],
          bannerBg: "",
          bannerPosition: "center",
        },
        { documentId: room.id, baselineId: "base", epoch: 0 }
      );
      await server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(seed));
      seed.destroy();
      const invitation = server.store.rotateCode(room.id, owner.id);
      const group: { document: Y.Doc; provider: HocuspocusProvider }[] = [];
      for (let member = 0; member < 10; member++) {
        const identity =
          member === 0 ? owner : server.store.register(`成员 ${groupIndex}:${member}`);
        if (member > 0) {
          const request = server.store.requestJoin(invitation.code, identity.id);
          if (request.status !== "pending") throw new Error("申请不存在");
          server.store.decide(request.id, owner.id, true);
        }
        const document = new Y.Doc();
        const socket = new HocuspocusProviderWebsocket({
          url: `ws://127.0.0.1:${address.port}/ws`,
          WebSocketPolyfill: WebSocket,
        });
        const provider = new HocuspocusProvider({
          name: room.id,
          document,
          websocketProvider: socket,
          token: () => server.store.ticket(identity.id, room.id, 2),
        });
        cleanup.push(() => {
          provider.destroy();
          socket.destroy();
          document.destroy();
        });
        provider.attach();
        group.push({ document, provider });
      }
      groups.push(group);
    }
    await until(() => groups.flat().every(client => client.provider.synced));
    for (const group of groups)
      group.forEach((client, index) => client.document.getText("title").insert(0, String(index)));
    await until(() =>
      groups.every(group =>
        group.every(
          client =>
            client.document.getText("title").length === 10 && !client.provider.hasUnsyncedChanges
        )
      )
    );
    for (const group of groups)
      expect(new Set(group.map(client => client.document.getText("title").toString())).size).toBe(
        1
      );
  });

  it("离线增量通过 SyncStep2 持久化，并在撤权后拒绝继续更新", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-realtime-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const server = await createServer({ dataDir: directory, logger: false });
    await server.app.listen({ host: "127.0.0.1", port: 0 });
    cleanup.push(() => server.app.close());
    const address = server.app.server.address();
    if (!address || typeof address === "string") throw new Error("监听失败");
    const owner = server.store.register("作者"),
      guest = server.store.register("访客");
    const room = server.store.create(owner.id, "realtime");
    const original = await createTestDocument(
      {
        title: "初始",
        content: [{ type: "paragraph", children: [{ text: "内容" }] }],
        bannerBg: "",
        bannerPosition: "center",
      },
      { documentId: room.id, baselineId: "base", epoch: 0 }
    );
    await server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(original));
    const request = server.store.requestJoin(
      server.store.rotateCode(room.id, owner.id).code,
      guest.id
    );
    if (request.status !== "pending") throw new Error("未创建申请");
    server.store.decide(request.id, owner.id, true);
    const connect = (deviceId: string, document: Y.Doc) => {
      const socket = new HocuspocusProviderWebsocket({
        url: `ws://127.0.0.1:${address.port}/ws`,
        WebSocketPolyfill: WebSocket,
      });
      const provider = new HocuspocusProvider({
        name: room.id,
        document,
        websocketProvider: socket,
        token: () => server.store.ticket(deviceId, room.id, 2),
      });
      provider.attach();
      cleanup.push(() => {
        provider.destroy();
        socket.destroy();
        document.destroy();
      });
      return { socket, provider };
    };
    const offline = new Y.Doc();
    Y.applyUpdate(offline, Y.encodeStateAsUpdate(original));
    replaceText(offline.getText("title"), "离线修改已保存");
    const first = connect(owner.id, offline);
    await until(() => first.provider.synced && !first.provider.hasUnsyncedChanges);
    const persisted = server.store.loadDocument(room.id);
    expect(readNodeDocument(persisted).title).toBe("离线修改已保存");
    persisted.destroy();
    const secondDoc = new Y.Doc();
    const second = connect(guest.id, secondDoc);
    await until(() => second.provider.synced);
    expect(readNodeDocument(secondDoc).title).toBe("离线修改已保存");
    offline.getText("title").insert(0, "同步：");
    await until(() => secondDoc.getText("title").toString().startsWith("同步："));
    const response = await server.app.inject({
      method: "DELETE",
      url: `/v1/documents/${room.id}/members/${guest.id}`,
      headers: { authorization: `Bearer ${owner.id}:${owner.secret}` },
    });
    expect(response.statusCode).toBe(200);
    replaceText(secondDoc.getText("title"), "撤权后修改");
    await new Promise(resolve => setTimeout(resolve, 100));
    const state = server.store.loadDocument(room.id);
    expect(state.getText("title").toString()).not.toBe("撤权后修改");
    state.destroy();
    original.destroy();
  });
});
