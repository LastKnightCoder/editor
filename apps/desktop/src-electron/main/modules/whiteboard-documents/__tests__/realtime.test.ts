// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import { WhiteboardModel, createWhiteboardDocument, type WhiteboardPeer } from "@tau/collaboration";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { createServer } from "../../../../../../collaboration-server/src/server";
import { CollaborationClient } from "../../collaboration/client";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { WhiteboardRealtime } from "../realtime";
import { whiteboardRemoteTransport } from "../remote";

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

it("HTTP 提交的位置和文字经真实推送到达，光标选区独立同步并在离开后清除", async () => {
  const dir = mkdtempSync(join(tmpdir(), "whiteboard-push-"));
  const server = await createServer({ dataDir: join(dir, "server"), logger: false });
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  cleanup.push(async () => {
    await server.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const address = server.app.server.address();
  if (!address || typeof address === "string") throw new Error("监听失败");
  const url = `http://127.0.0.1:${address.port}`;
  const owner = server.store.register("作者");
  const room = server.store.create(owner.id, "whiteboard");
  const local = new CollaborationLocalStore(join(dir, "client"));
  cleanup.push(() => local.db.close());
  const client = new CollaborationClient(local);
  client.saveIdentity(url, owner);
  const source = new Y.Doc();
  const model = new WhiteboardModel(source);
  const contract = await prepareWhiteboardContract("test", {
    type: "test.rectangle",
    dataVersion: 1,
    collaboration: { textFields: ["text"] },
  });
  await model.installContracts({ [contract.id]: contract.contract });
  const pageId = model.submit([{ type: "create_page", title: "页" }], {}).createdIds[0];
  const elementId = model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        data: {},
        geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
        parent: { kind: "page", id: pageId },
      },
    ],
    {}
  ).createdIds[0];
  const identity = { documentId: room.id, epoch: 0, baselineId: "base" };
  const doc = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(source));
  const editing = new WhiteboardModel(doc);
  await server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(doc));
  cleanup.push(() => {
    model.dispose();
    source.destroy();
    editing.dispose();
    doc.destroy();
  });
  const views = [0, 1].map(index => {
    const received = new Y.Doc();
    const board = new WhiteboardModel(received);
    const state = { connected: false, peers: [] as WhiteboardPeer[] };
    const realtime = new WhiteboardRealtime(
      client,
      url,
      server.store.protocols.state(room.id),
      async bytes => {
        expect((await board.receive(bytes)).status).toBe("applied");
      },
      event => Object.assign(state, event),
      index === 0 ? () => Y.encodeStateAsUpdate(doc) : undefined
    );
    cleanup.push(() => {
      realtime.dispose();
      board.dispose();
      received.destroy();
    });
    return { realtime, board, received, state };
  });
  await vi.waitFor(
    () =>
      expect(
        views.every(view => view.state.connected && view.board.read().pages.length === 1)
      ).toBe(true),
    { timeout: 5000 }
  );
  const initial = Y.encodeStateAsUpdate(views[1].received);
  views[0].realtime.presence({
    pageId,
    cursor: { x: 40, y: 50 },
    moving: true,
    selection: [{ id: elementId, minX: 10, minY: 20, maxX: 110, maxY: 100 }],
  });
  await vi.waitFor(
    () =>
      expect(views[1].state.peers[0]).toMatchObject({
        userId: owner.id,
        name: "作者",
        pageId,
        cursor: { x: 40, y: 50 },
        moving: true,
      }),
    { timeout: 2000 }
  );
  expect(Y.encodeStateAsUpdate(views[1].received)).toEqual(initial);
  const vector = Y.encodeStateVector(doc);
  editing.submit(
    [
      {
        type: "set_node",
        id: elementId,
        patch: { geometry: { x: 300, y: 200, width: 100, height: 80, rotation: 0 } },
      },
      {
        type: "edit_text",
        id: elementId,
        field: "text",
        edit: { offset: 0, remove: 0, text: "实时输入" },
      },
    ],
    {}
  );
  const update = Y.encodeStateAsUpdate(doc, vector);
  await whiteboardRemoteTransport(client, url, room.id).submit(
    {
      ...identity,
      operationId: randomUUID(),
      version: 3,
      updateHash: createHash("sha256").update(update).digest("hex"),
      expiresAt: Date.now() + 60_000,
    },
    update
  );
  await vi.waitFor(
    () =>
      expect(views[1].board.read().pages[0].children[0]).toMatchObject({
        geometry: { x: 300, y: 200 },
        data: { text: "实时输入" },
      }),
    { timeout: 2000 }
  );
  editing.submit(
    [
      {
        type: "set_node",
        id: elementId,
        patch: { geometry: { x: 450, y: 350, width: 100, height: 80, rotation: 0 } },
      },
      {
        type: "edit_text",
        id: elementId,
        field: "text",
        edit: { offset: 0, remove: 4, text: "实时直推" },
      },
    ],
    {}
  );
  const sequence = server.store.operations.sequence(room.id);
  views[0].realtime.publishDocument();
  await vi.waitFor(() => expect(views[1].board.read().pages[0].children[0].geometry.x).toBe(450), {
    timeout: 2000,
  });
  expect(server.store.operations.sequence(room.id)).toBeGreaterThan(sequence);
  expect(views[1].board.read().pages[0].children[0].data.text).toBe("实时直推");
  views[0].realtime.presence(null);
  await vi.waitFor(() => expect(views[1].state.peers).toEqual([]), { timeout: 2000 });
  const socket = (
    views[1].realtime as unknown as { socket: { disconnect(): void; connect(): Promise<unknown> } }
  ).socket;
  socket.disconnect();
  await vi.waitFor(() => expect(views[1].state.connected).toBe(false));
  const offlineVector = Y.encodeStateVector(doc);
  editing.submit(
    [
      {
        type: "edit_text",
        id: elementId,
        field: "text",
        edit: { offset: 4, remove: 0, text: "·重连" },
      },
    ],
    {}
  );
  const offlineUpdate = Y.encodeStateAsUpdate(doc, offlineVector);
  await whiteboardRemoteTransport(client, url, room.id).submit(
    {
      ...identity,
      operationId: randomUUID(),
      version: 3,
      updateHash: createHash("sha256").update(offlineUpdate).digest("hex"),
      expiresAt: Date.now() + 60_000,
    },
    offlineUpdate
  );
  expect(views[1].board.read().pages[0].children[0].data.text).toBe("实时直推");
  await socket.connect();
  await vi.waitFor(
    () => expect(views[1].board.read().pages[0].children[0].data.text).toBe("实时直推·重连"),
    { timeout: 5000 }
  );
});
