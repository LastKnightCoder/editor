import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { WebSocket } from "ws";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  WhiteboardModel,
  createWhiteboardDocument,
  type DocumentOperationRequest,
  type DocumentWriteQueue,
} from "@tau/collaboration";
import { prepareWhiteboardContract } from "../../../packages/db-schema/content-contracts";
import { createServer } from "./server";
import { replaceStoredBaseline } from "./testing/replace-baseline";
import { CollaborationStore } from "./store";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const hash = (state: Uint8Array) => createHash("sha256").update(state).digest("hex");
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "whiteboard-w5-")),
    server = await createServer({ dataDir: dir, logger: false });
  await server.app.ready();
  const owner = server.store.register("白板作者"),
    room = server.store.create(owner.id, "whiteboard");
  const source = new Y.Doc(),
    model = new WhiteboardModel(source);
  const contract = await prepareWhiteboardContract("unknown", {
    type: "unknown.shape",
    dataVersion: 1,
    resources: [{ path: "image", kind: "image" }],
    collaboration: { textFields: ["source"] },
  });
  await model.installContracts({ [contract.id]: contract.contract });
  const [page, second] = model.submit(
    [
      { type: "create_page", title: "甲" },
      { type: "create_page", title: "乙" },
    ],
    {}
  ).createdIds;
  const id = model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        data: {},
        geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        parent: { kind: "page", id: page },
      },
    ],
    {}
  ).createdIds[0];
  const identity = { documentId: room.id, epoch: 0, baselineId: "base" },
    doc = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(source));
  source.destroy();
  const board = new WhiteboardModel(doc),
    headers = { authorization: `Bearer ${owner.id}:${owner.secret}` };
  await server.store.publish(room.id, owner.id, Y.encodeStateAsUpdate(doc));
  cleanup.push(async () => {
    board.dispose();
    doc.destroy();
    await server.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const update = (fn: () => void) => {
    const vector = Y.encodeStateVector(doc);
    fn();
    return Y.encodeStateAsUpdate(doc, vector);
  };
  const request = (
    update: Uint8Array,
    operationId: string = crypto.randomUUID(),
    conditional = false
  ): DocumentOperationRequest => ({
    operationId,
    ...identity,
    version: 3,
    updateHash: hash(update),
    expiresAt: Date.now() + 60_000,
    ...(conditional
      ? {
          expectedRevision: server.store.protocols.state(room.id).revision,
          expectedSequence: server.store.operations.sequence(room.id),
        }
      : {}),
  });
  const send = (request: DocumentOperationRequest, update: Uint8Array) =>
    server.app.inject({
      method: "POST",
      url: `/v1/documents/${room.id}/operations/${request.operationId}`,
      headers,
      payload: { ...request, update: Buffer.from(update).toString("base64") },
    });
  return { ...server, owner, room, doc, board, headers, update, request, send, id, page, second };
}
it("并发小增量只在取得队列执行权后加载全文", async () => {
  const f = await fixture();
  f.store.protocols.state(f.room.id);
  const live = new Set<Y.Doc>();
  const original = f.store.loadDocument.bind(f.store);
  const loading = vi.spyOn(f.store, "loadDocument").mockImplementation(id => {
    const doc = original(id);
    live.add(doc);
    doc.on("destroy", () => live.delete(doc));
    return doc;
  });
  let release!: () => void;
  const queue = (f.store as unknown as { writes: DocumentWriteQueue }).writes;
  const gate = queue.run(
    f.room.id,
    0,
    () =>
      new Promise<void>(resolve => {
        release = resolve;
      })
  );
  await Promise.resolve();
  await Promise.resolve();
  const update = f.update(() =>
    f.board.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "字" } }], {})
  );
  const pending = Array.from({ length: 12 }, (_, i) =>
    f.store.submitOperation(f.room.id, f.owner.id, f.request(update, `queued-${i}`), update)
  );
  const retained = live.size;
  release();
  await gate;
  const results = await Promise.all(pending);
  expect(retained).toBe(0);
  expect(results.every(result => result?.state === "COMMITTED")).toBe(true);
  expect(live.size).toBe(0);
  loading.mockRestore();
});

it("摘要轮询不加载全文，文字删除后的回执、摘要和落盘状态一致", async () => {
  const f = await fixture();
  f.store.protocols.state(f.room.id);
  const loading = vi.spyOn(f.store, "loadDocument");
  const poll = async () =>
    (
      await f.app.inject({
        method: "GET",
        url: `/v1/documents/${f.room.id}/protocol`,
        headers: f.headers,
      })
    ).json();
  for (let i = 0; i < 5; i++) await poll();
  expect(loading).not.toHaveBeenCalled();
  for (const edit of [
    { offset: 0, remove: 0, text: "甲乙" },
    { offset: 0, remove: 1, text: "丙" },
  ]) {
    const update = f.update(() => f.board.submit([{ type: "edit_title", edit }], {}));
    const response = await f.send(f.request(update), update);
    const durable = f.store.loadDocument(f.room.id);
    const revision = hash(Y.encodeStateAsUpdate(durable));
    durable.destroy();
    loading.mockClear();
    const head = await poll();
    expect(head.revision).toBe(revision);
    expect(response.json().operation.receipt.revision).toBe(revision);
    expect(loading).not.toHaveBeenCalled();
  }
  loading.mockRestore();
  const expected = f.store.protocols.state(f.room.id);
  f.store.db
    .prepare(
      "UPDATE collaboration_protocol SET value=json_set(value,'$.revision','old-version-revision') WHERE document_id=?"
    )
    .run(f.room.id);
  const restarted = new CollaborationStore(f.store.config);
  try {
    const reload = vi.spyOn(restarted, "loadDocument");
    expect(restarted.protocols.state(f.room.id)).toEqual(expected);
    expect(reload).toHaveBeenCalledTimes(1);
    reload.mockClear();
    expect(restarted.protocols.state(f.room.id)).toEqual(expected);
    expect(reload).not.toHaveBeenCalled();
  } finally {
    restarted.close();
  }
});

it("白板 HTTP 接纳、稳定多页和幂等回执；旧客户端不能取快照或票据", async () => {
  const f = await fixture();
  const update = f.update(() =>
    f.board.submit([{ type: "move_node", id: f.id, parent: { kind: "page", id: f.second } }], {})
  );
  const request = f.request(update),
    first = await f.send(request, update),
    retry = await f.send(request, update);
  expect(first.statusCode).toBe(200);
  expect(first.json().operation.state).toBe("COMMITTED");
  expect(retry.json()).toEqual(first.json());
  expect(f.store.operations.sequence(f.room.id)).toBe(1);
  const stored = f.store.loadDocument(f.room.id);
  try {
    expect(new WhiteboardModel(stored).read().pages[1].children[0].id).toBe(f.id);
  } finally {
    stored.destroy();
  }
  expect(() => f.store.ticket(f.owner.id, f.room.id, 2)).toThrow();
  expect(typeof f.store.ticket(f.owner.id, f.room.id, 3, { epoch: 0, baselineId: "base" })).toBe(
    "string"
  );
  expect(
    (
      await f.app.inject({
        method: "GET",
        url: `/v1/documents/${f.room.id}/state`,
        headers: f.headers,
      })
    ).statusCode
  ).toBe(409);
  const mismatch = await f.send(
    { ...request, updateHash: hash(new Uint8Array([0, 0])) },
    new Uint8Array([0, 0])
  );
  expect(mismatch.statusCode).toBe(409);
});
it("整文档条件竞争只有一个成功，失败提案不改变文档或修订", async () => {
  const f = await fixture();
  const a = f.update(() =>
    f.board.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "甲" } }], {})
  );
  const b = f.update(() =>
    f.board.submit([{ type: "edit_title", edit: { offset: 1, remove: 0, text: "乙" } }], {})
  );
  const ra = f.request(a, "a", true),
    rb = f.request(b, "b", true);
  const [one, two] = await Promise.all([f.send(ra, a), f.send(rb, b)]);
  expect(one.json().operation.state).toBe("COMMITTED");
  expect(two.json().operation).toMatchObject({ state: "ABORTED", reason: "REVISION_CONFLICT" });
  expect(f.store.operations.sequence(f.room.id)).toBe(1);
  const state = f.store.loadDocument(f.room.id);
  try {
    expect(new WhiteboardModel(state).read().title).toBe("甲");
  } finally {
    state.destroy();
  }
});
it("缺依赖不确认、不推进修订；补祖先后原批次可重试", async () => {
  const f = await fixture();
  const a = f.update(() =>
    f.board.submit(
      [{ type: "edit_text", id: f.id, field: "source", edit: { offset: 0, remove: 0, text: "a" } }],
      {}
    )
  );
  const b = f.update(() =>
    f.board.submit(
      [{ type: "edit_text", id: f.id, field: "source", edit: { offset: 1, remove: 0, text: "b" } }],
      {}
    )
  );
  const request = f.request(b),
    response = await f.send(request, b);
  expect(response.statusCode).toBe(409);
  expect(response.json().code).toBe("MISSING_DEPENDENCIES");
  expect(f.store.operations.get(f.room.id, request.operationId, f.owner.id)?.state).toBe("PENDING");
  expect(f.store.operations.sequence(f.room.id)).toBe(0);
  expect((await f.send(f.request(a), a)).json().operation.state).toBe("COMMITTED");
  expect((await f.send(request, b)).json().operation.state).toBe("COMMITTED");
});
it("回执写失败与文档安装原子回滚，重复请求恢复同一操作", async () => {
  const f = await fixture(),
    before = f.store.protocols.state(f.room.id).revision;
  const update = f.update(() =>
    f.board.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "保存" } }], {})
  );
  const request = f.request(update);
  f.store.db.exec(
    "CREATE TRIGGER fail_receipt BEFORE UPDATE ON collaboration_operations WHEN json_extract(new.value,'$.state')='COMMITTED' BEGIN SELECT RAISE(ABORT,'disk full'); END;"
  );
  expect((await f.send(request, update)).statusCode).toBe(500);
  expect(f.store.protocols.state(f.room.id).revision).toBe(before);
  expect(f.store.operations.sequence(f.room.id)).toBe(0);
  f.store.db.exec("DROP TRIGGER fail_receipt");
  expect((await f.send(request, update)).json().operation.state).toBe("COMMITTED");
});
it("非法祖先被拒后依赖分支不能进入确认基线，取消先到不复活", async () => {
  const f = await fixture(),
    before = f.store.protocols.state(f.room.id).revision;
  const bad = f.update(() => f.doc.getMap("unknown").set("bad", "x"));
  const request = f.request(bad);
  expect((await f.send(request, bad)).json().operation).toMatchObject({
    state: "ABORTED",
    reason: "INVALID_DOCUMENT",
  });
  const child = f.update(() => f.doc.getMap("unknown").set("bad", "y"));
  expect((await f.send(f.request(child), child)).statusCode).toBe(409);
  expect(f.store.protocols.state(f.room.id).revision).toBe(before);
  const cancelled = f.request(bad, "cancelled");
  await f.store.submitOperation(f.room.id, f.owner.id, cancelled, undefined, true);
  expect((await f.send(cancelled, bad)).json().operation.state).toBe("ABORTED");
});
it("存储基线变化后旧票据与批次被拒绝，资源历史保持不变", async () => {
  const f = await fixture();
  f.store.insertAsset(f.room.id, "asset-a", "a".repeat(64), "a", "image/png", 1);
  f.store.insertAsset(f.room.id, "asset-b", "b".repeat(64), "b", "image/png", 1);
  for (const image of ["asset-a", "asset-b"]) {
    const update = f.update(() =>
      f.board.submit(
        [{ type: "set_data", id: f.id, patch: { image: `tau-collab-asset:${image}` } }],
        {}
      )
    );
    expect((await f.send(f.request(update), update)).json().operation.state).toBe("COMMITTED");
  }
  expect(
    f.store.db.prepare("SELECT asset_id FROM collaboration_asset_history ORDER BY asset_id").all()
  ).toEqual([{ asset_id: "asset-a" }, { asset_id: "asset-b" }]);
  const old = f.store.ticket(f.owner.id, f.room.id, 3, { epoch: 0, baselineId: "base" });
  const fresh = new Y.Doc(),
    model = new WhiteboardModel(fresh);
  model.submit([{ type: "create_page", title: "新代次" }], {});
  const next = await createWhiteboardDocument(
    { documentId: f.room.id, baselineId: "new", epoch: 1 },
    Y.encodeStateAsUpdate(fresh)
  );
  try {
    replaceStoredBaseline(f.store, f.room.id, next);
    expect(() => f.store.verifyTicket(old, f.room.id)).toThrow();
    expect(() => f.store.ticket(f.owner.id, f.room.id, 3)).toThrow();
    expect(() =>
      f.store.ticket(f.owner.id, f.room.id, 3, { epoch: 0, baselineId: "base" })
    ).toThrow();
    const update = f.update(() =>
      f.board.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "旧代次" } }], {})
    );
    expect((await f.send(f.request(update), update)).json().operation.reason).toBe(
      "EPOCH_CONFLICT"
    );
    f.store.db.prepare("UPDATE assets SET last_referenced_at=0").run();
    f.store.compact(f.room.id);
    expect(f.store.db.prepare("SELECT COUNT(*) AS n FROM assets").get()).toEqual({ n: 2 });
  } finally {
    next.destroy();
    fresh.destroy();
  }
});

it("真实 WebSocket 接纳白板并发移动/文字，HTTP 条件结果广播给在线视图", async () => {
  const f = await fixture();
  await f.app.listen({ host: "127.0.0.1", port: 0 });
  const address = f.app.server.address();
  if (!address || typeof address === "string") throw new Error("监听失败");
  const clients = [0, 1].map(() => {
    const doc = new Y.Doc(),
      model = new WhiteboardModel(doc);
    const socket = new HocuspocusProviderWebsocket({
      url: `ws://127.0.0.1:${address.port}/ws`,
      WebSocketPolyfill: WebSocket,
    });
    const provider = new HocuspocusProvider({
      name: f.room.id,
      document: doc,
      websocketProvider: socket,
      token: () => f.store.ticket(f.owner.id, f.room.id, 3, { epoch: 0, baselineId: "base" }),
    });
    provider.attach();
    cleanup.push(async () => {
      provider.destroy();
      socket.destroy();
      model.dispose();
      doc.destroy();
    });
    return { doc, model, provider };
  });
  const until = async (check: () => boolean) => {
    for (let n = 0; n < 250; n++) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("白板网络同步超时");
  };
  await until(() => clients.every(client => client.provider.synced));
  clients[0].model.submit(
    [{ type: "move_node", id: f.id, parent: { kind: "page", id: f.second } }],
    {}
  );
  clients[1].model.submit(
    [
      {
        type: "edit_text",
        id: f.id,
        field: "source",
        edit: { offset: 0, remove: 0, text: "网络输入" },
      },
    ],
    {}
  );
  await until(() =>
    clients.every(
      client =>
        !client.provider.hasUnsyncedChanges &&
        client.model.read().pages[1].children[0]?.data.source === "网络输入"
    )
  );
  expect(clients[0].model.read()).toEqual(clients[1].model.read());
  const update = f.update(() =>
    f.board.submit(
      [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "HTTP 条件结果" } }],
      {}
    )
  );
  const operation = await f.send(f.request(update, "http", true), update);
  expect(operation.json().operation.state).toBe("COMMITTED");
  await until(() => clients.every(client => client.model.title.toString() === "HTTP 条件结果"));
  const revision = f.store.operations.sequence(f.room.id),
    current = f.store.loadDocument(f.room.id);
  try {
    await f.store.appendUpdate(f.room.id, f.owner.id, new Uint8Array([0, 0]), current);
  } finally {
    current.destroy();
  }
  expect(f.store.operations.sequence(f.room.id)).toBe(revision);
});

it("被拒提案已上传的资源仍有独立历史持有，不随当前投影缺失回收", async () => {
  const f = await fixture();
  f.store.insertAsset(f.room.id, "rejected-asset", "c".repeat(64), "draft", "image/png", 1);
  const update = f.update(() => {
    f.board.submit(
      [{ type: "set_data", id: f.id, patch: { image: "tau-collab-asset:rejected-asset" } }],
      {}
    );
    f.doc.getMap("invalid").set("x", 1);
  });
  expect((await f.send(f.request(update), update)).json().operation.state).toBe("ABORTED");
  f.store.db.prepare("UPDATE assets SET last_referenced_at=0").run();
  f.store.compact(f.room.id);
  expect(f.store.db.prepare("SELECT id FROM assets").all()).toEqual([{ id: "rejected-asset" }]);
});

it("过期与取消回执不复活，成员也不能读取他人的操作回执", async () => {
  const f = await fixture();
  const update = f.update(() =>
    f.board.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "过期提案" } }], {})
  );
  const request = { ...f.request(update), expiresAt: Date.now() - 1 };
  expect((await f.send(request, update)).json().operation.state).toBe("EXPIRED");
  expect((await f.send(request, update)).json().operation.state).toBe("EXPIRED");
  expect(f.store.operations.sequence(f.room.id)).toBe(0);
  const member = f.store.register("另一成员");
  f.store.db
    .prepare(
      "INSERT INTO members(document_id,device_id,role,status) VALUES (?,?,'editor','active')"
    )
    .run(f.room.id, member.id);
  expect(
    (
      await f.app.inject({
        method: "GET",
        url: `/v1/documents/${f.room.id}/operations/${request.operationId}`,
        headers: { authorization: `Bearer ${member.id}:${member.secret}` },
      })
    ).statusCode
  ).toBe(409);
});

it("首次发布候选不可替换，回执跨后续编辑保留，取消不能撤回已激活房间", async () => {
  const f = await fixture();
  const original = Y.encodeStateAsUpdate(f.doc),
    revision = hash(original);
  expect(f.store.publicationStatus(f.room.id, f.owner.id)).toMatchObject({
    state: "COMMITTED",
    receipt: { candidateHash: revision, version: 3 },
  });
  await f.store.publish(f.room.id, f.owner.id, original);
  f.board.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "different" } }], null);
  await expect(
    f.store.publish(f.room.id, f.owner.id, Y.encodeStateAsUpdate(f.doc))
  ).rejects.toThrow("不能更换");
  expect(f.store.cancelPublication(f.room.id, f.owner.id).state).toBe("COMMITTED");
  const response = await f.app.inject({
    method: "GET",
    url: `/v1/documents/${f.room.id}/publication`,
    headers: f.headers,
  });
  expect(response.statusCode).toBe(200);
  expect(response.json().receipt.candidateHash).toBe(revision);
});
it("发布取消先到固定关闭终态，原创建键不能复活房间", async () => {
  const f = await fixture();
  const room = f.store.create(f.owner.id, "cancel-first");
  expect(f.store.cancelPublication(room.id, f.owner.id).state).toBe("ABORTED");
  expect(f.store.create(f.owner.id, "cancel-first").id).toBe(room.id);
  const model = new WhiteboardModel(new Y.Doc());
  model.submit([{ type: "create_page", title: "页" }], null);
  const candidate = await createWhiteboardDocument(
    { documentId: room.id, baselineId: "new", epoch: 0 },
    Y.encodeStateAsUpdate(model.doc)
  );
  try {
    expect(() => f.store.publish(room.id, f.owner.id, Y.encodeStateAsUpdate(candidate))).toThrow(
      "结束"
    );
  } finally {
    candidate.destroy();
    model.dispose();
    model.doc.destroy();
  }
});

it("白板 Presence 服务入口执行 UTF-8 与每连接 600 次门禁，不修改文档", async () => {
  const f = await fixture();
  const before = Y.encodeStateAsUpdate(f.doc);
  const handleAwareness = f.hocuspocus.configuration.beforeHandleAwareness;
  if (!handleAwareness) throw new Error("Presence 服务入口未注册");
  const invoke = (states: Map<number, object>, socketId: string) =>
    handleAwareness({
      context: { deviceId: f.owner.id, nickname: "作者" },
      documentName: f.room.id,
      states,
      socketId,
      connection: { socketId },
    } as never);
  const oversized = new Map([[1, { value: "汉".repeat(6000) }]]);
  expect(JSON.stringify([...oversized]).length).toBeLessThan(16384);
  await expect(invoke(oversized, "unicode")).rejects.toThrow("在线状态超过限制");
  for (let index = 0; index < 600; index++)
    await invoke(new Map([[1, { activity: "editing" }]]), "rate");
  await expect(invoke(new Map([[1, {}]]), "rate")).rejects.toThrow("过于频繁");
  await expect(invoke(new Map([[1, {}]]), "another-connection")).resolves.toBeUndefined();
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
});
