// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  DocumentSyncSession,
  WhiteboardModel,
  createWhiteboardDocument,
  type DocumentSyncTransport,
  type ConfirmedDocument,
} from "@tau/collaboration";
import { WhiteboardRemoteJournal } from "../remote";
import { WhiteboardJournal } from "../journal";
import { CollaborationStore } from "../../../../../../collaboration-server/src/store";
import { loadConfig } from "../../../../../../collaboration-server/src/config";
const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(fn => fn())
);
afterEach(() => vi.useRealTimers());
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "whiteboard-remote-")),
    store = new CollaborationStore(loadConfig({ dataDir: dir })),
    owner = store.register("作者"),
    room = store.create(owner.id, "whiteboard");
  const doc = new Y.Doc(),
    board = new WhiteboardModel(doc);
  board.submit([{ type: "create_page", title: "初始" }], {});
  const published = await createWhiteboardDocument(
    { documentId: room.id, epoch: 0, baselineId: "base" },
    Y.encodeStateAsUpdate(doc)
  );
  doc.destroy();
  await store.publish(room.id, owner.id, Y.encodeStateAsUpdate(published));
  const journal = new WhiteboardJournal(join(dir, "local.db")),
    remote = new WhiteboardRemoteJournal(journal, room.id);
  const transport: DocumentSyncTransport = {
    async read() {
      const doc = store.loadDocument(room.id);
      try {
        return {
          state: Y.encodeStateAsUpdate(doc),
          protocol: {
            ...store.protocols.state(room.id),
            sequence: store.operations.sequence(room.id),
          },
        };
      } finally {
        doc.destroy();
      }
    },
    async submit(request, update) {
      return (await store.submitOperation(room.id, owner.id, request, update))!;
    },
    async receipt(id) {
      return store.operations.get(room.id, id, owner.id);
    },
    async cancel(request) {
      return (await store.submitOperation(room.id, owner.id, request, undefined, true))!;
    },
  };
  const model = new WhiteboardModel(published);
  const update = (text: string) => {
    const vector = Y.encodeStateVector(published);
    model.submit(
      [{ type: "edit_title", edit: { offset: model.title.length, remove: 0, text } }],
      {}
    );
    return Y.encodeStateAsUpdate(published, vector);
  };
  cleanup.push(() => {
    published.destroy();
    journal.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const session = await DocumentSyncSession.open(room.id, remote, transport);
  return { room, store, owner, journal, remote, transport, session, published, model, update };
}
it("回执丢失保留待发送数据，重启查询终态且不重复提交", async () => {
  const f = await fixture(),
    original = f.transport.submit;
  f.transport.submit = async (request, update) => {
    await original(request, update);
    throw new Error("connection lost");
  };
  await f.session.stage(f.update("已提交"));
  await expect(f.session.flush()).rejects.toThrow("connection lost");
  expect((await f.remote.load())?.pending).toHaveLength(1);
  const restored = await DocumentSyncSession.open(f.room.id, f.remote, f.transport);
  await restored.flush();
  expect(restored.snapshot().pending).toHaveLength(0);
  expect(f.journal.db.prepare("SELECT count(*) AS n FROM remote_receipts").get()).toEqual({ n: 1 });
  expect(f.store.operations.sequence(f.room.id)).toBe(1);
});
it("普通增量断网六分钟并重启后续传完整因果链，旧操作保持过期", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = await fixture();
  const first = await f.session.stage(f.update("甲"));
  await f.session.stage(f.update("乙"));
  vi.spyOn(f.transport, "submit").mockRejectedValueOnce(new Error("offline"));
  await expect(f.session.flush()).rejects.toThrow("offline");
  vi.setSystemTime(Date.now() + 6 * 60_000);
  const restored = await DocumentSyncSession.open(f.room.id, f.remote, f.transport);
  await restored.flush();
  expect(f.store.operations.get(f.room.id, first, f.owner.id)?.state).toBe("EXPIRED");
  expect(restored.snapshot()).toMatchObject({ blocked: false, pending: [], rejected: [] });
  const doc = f.store.loadDocument(f.room.id);
  expect(doc.getText("whiteboard:title").toString()).toBe("甲乙");
  doc.destroy();
  expect(f.store.operations.sequence(f.room.id)).toBe(2);
});
it("条件替换过期仍隔离，结果未知时普通增量不换身份", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = await fixture();
  const protocol = f.session.snapshot().confirmed.protocol;
  const id = await f.session.stage(f.update("条件"), {
    revision: protocol.revision,
    sequence: protocol.sequence,
  });
  vi.setSystemTime(Date.now() + 6 * 60_000);
  await expect(f.session.flush()).rejects.toMatchObject({ code: "BRANCH_RETAINED" });
  expect(f.store.operations.get(f.room.id, id, f.owner.id)?.state).toBe("EXPIRED");
  expect(f.store.operations.sequence(f.room.id)).toBe(0);
  const g = await fixture();
  const ordinary = await g.session.stage(g.update("未知"));
  vi.setSystemTime(Date.now() + 6 * 60_000);
  vi.spyOn(g.transport, "receipt").mockRejectedValueOnce(new Error("receipt offline"));
  await expect(g.session.flush()).rejects.toThrow("receipt offline");
  expect(g.session.snapshot().pending[0].request.operationId).toBe(ordinary);
  expect(g.session.snapshot().blocked).toBe(false);
});
it.each([1000, -6 * 60_000])("客户端时钟偏差 %s ms 不改变服务端编辑期限", async skew => {
  const f = await fixture();
  const now = Date.now();
  f.transport.now = () => now;
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + skew);
  try {
    await f.session.stage(f.update("时钟"));
    await f.session.flush();
    expect(f.session.snapshot()).toMatchObject({ pending: [], blocked: false });
  } finally {
    clock.mockRestore();
  }
});
it("再次过期结束本次 flush，原输入仍可取消，不无限占用队列", async () => {
  const f = await fixture();
  f.transport.now = () => Date.now() - 6 * 60_000;
  await f.session.stage(f.update("保留"));
  const send = vi.spyOn(f.transport, "submit");
  await expect(f.session.flush()).rejects.toMatchObject({ code: "PENDING_OPERATION" });
  expect(send).toHaveBeenCalledTimes(2);
  expect(f.session.snapshot().pending).toHaveLength(1);
  await f.session.cancel(f.session.snapshot().pending[0].request.operationId);
  expect(f.session.snapshot().blocked).toBe(true);
});
it("普通增量过期后发现换代，不续传旧分支且保留原字节", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = await fixture();
  const update = f.update("旧代次输入");
  await f.session.stage(update);
  vi.setSystemTime(Date.now() + 6 * 60_000);
  const next = new Y.Doc();
  Y.applyUpdate(next, f.session.snapshot().confirmed.state);
  next.getMap("meta").set("epoch", 1);
  next.getMap("meta").set("baselineId", "new-base");
  const bytes = Y.encodeStateAsUpdate(next);
  f.transport.read = async () => ({
    state: bytes,
    protocol: {
      ...f.session.snapshot().confirmed.protocol,
      epoch: 1,
      baselineId: "new-base",
      revision: createHash("sha256").update(bytes).digest("hex"),
      sequence: 1,
    },
  });
  const send = vi.spyOn(f.transport, "submit");
  await expect(f.session.flush()).rejects.toMatchObject({ code: "BRANCH_RETAINED" });
  expect(send).toHaveBeenCalledTimes(1);
  expect(f.session.snapshot().rejected[0].operations[0].update).toEqual(update);
  expect(f.session.snapshot().blocked).toBe(true);
  next.destroy();
});
it("被拒祖先与后续分支整体耐久隔离，不将后继发送到确认基线", async () => {
  const f = await fixture(),
    baseline = f.session.snapshot().confirmed.state;
  const vector = Y.encodeStateVector(f.published);
  f.published.getMap("illegal").set("x", 1);
  const first = Y.encodeStateAsUpdate(f.published, vector),
    second = f.update("后续");
  await f.session.stage(first);
  await f.session.stage(second);
  const send = vi.spyOn(f.transport, "submit");
  await expect(f.session.flush()).rejects.toMatchObject({ code: "BRANCH_RETAINED" });
  expect(send).toHaveBeenCalledTimes(1);
  const saved = (await f.remote.load())!;
  expect(saved.rejected).toHaveLength(1);
  expect(saved.rejected[0].operations).toHaveLength(2);
  expect(saved.pending).toHaveLength(0);
  await expect(f.session.stage(second)).rejects.toMatchObject({ code: "PENDING_OPERATION" });
  expect((await f.session.restartFromConfirmed()).state).toEqual(baseline);
  expect(saved.confirmed.state).toEqual(baseline);
  const retained = new Y.Doc();
  Y.applyUpdate(retained, saved.rejected[0].state);
  expect(retained.getMap("illegal").get("x")).toBe(1);
  expect(new WhiteboardModel(retained).read().title).toBe("后续");
  retained.destroy();
});
it("隔离落盘失败不清理内存队列，不获取新基线", async () => {
  const f = await fixture();
  const vector = Y.encodeStateVector(f.published);
  f.published.getMap("illegal").set("x", 1);
  await f.session.stage(Y.encodeStateAsUpdate(f.published, vector));
  const read = vi.spyOn(f.transport, "read");
  vi.spyOn(f.remote, "save").mockRejectedValueOnce(new Error("disk full"));
  await expect(f.session.flush()).rejects.toThrow("disk full");
  expect(f.session.snapshot().pending).toHaveLength(1);
  expect(read).not.toHaveBeenCalled();
});
it.each([false, true])("换代先保全旧分支（待发送=%s），随后才安装新的确认快照", async pending => {
  const f = await fixture();
  if (pending) await f.session.stage(f.update("离线"));
  const fresh = new Y.Doc(),
    model = new WhiteboardModel(fresh);
  model.submit([{ type: "create_page", title: "新" }], {});
  const next = await createWhiteboardDocument(
    { documentId: f.room.id, epoch: 1, baselineId: "next" },
    Y.encodeStateAsUpdate(fresh)
  );
  const state = Y.encodeStateAsUpdate(next);
  const confirmed: ConfirmedDocument = {
    state,
    protocol: {
      ...f.session.snapshot().confirmed.protocol,
      epoch: 1,
      baselineId: "next",
      revision: createHash("sha256").update(state).digest("hex"),
      sequence: 5,
    },
  };
  f.transport.read = async () => confirmed;
  await f.session.synchronize();
  const saved = (await f.remote.load())!;
  expect(saved.confirmed.protocol.epoch).toBe(1);
  expect(saved.rejected[0].reason).toBe("EPOCH_CONFLICT");
  expect(saved.rejected[0].operations).toHaveLength(pending ? 1 : 0);
  expect(saved.rejected[0].baseline.protocol.epoch).toBe(0);
  expect(saved.blocked).toBe(true);
  fresh.destroy();
  next.destroy();
});
it("损坏的分支日志不自动删除或重建", async () => {
  const f = await fixture();
  f.journal.db.prepare("UPDATE remote_branches SET value='broken'").run();
  await expect(DocumentSyncSession.open(f.room.id, f.remote, f.transport)).rejects.toThrow("损坏");
  expect(f.journal.db.prepare("SELECT value FROM remote_branches").get()).toEqual({
    value: "broken",
  });
});

it("旧日志实例不能覆盖另一实例的待确认操作，落盘失败也不推进读取修订", async () => {
  const f = await fixture();
  const otherJournal = new WhiteboardRemoteJournal(f.journal, f.room.id);
  const other = await DocumentSyncSession.open(f.room.id, otherJournal, f.transport);
  const operationId = await other.stage(f.update("未知结果"));
  vi.spyOn(f.transport, "submit").mockRejectedValueOnce(new Error("offline"));
  await expect(other.flush()).rejects.toThrow("offline");
  await expect(f.session.synchronize()).rejects.toThrow("另一会话更新");
  const retained = await new WhiteboardRemoteJournal(f.journal, f.room.id).load();
  expect(retained?.pending.map(item => item.request.operationId)).toEqual([operationId]);
  f.journal.db.exec(
    "CREATE TEMP TRIGGER fail_remote BEFORE UPDATE ON remote_branches BEGIN SELECT RAISE(ABORT,'disk full'); END"
  );
  await expect(other.stage(f.update("后继"))).rejects.toThrow("disk full");
  f.journal.db.exec("DROP TRIGGER fail_remote");
  await other.flush();
  expect(await otherJournal.receipt(operationId)).toMatchObject({ operationId });
});

it("本机暂存回执丢失后同 ID 重试幂等，不能偷偷更换候选", async () => {
  const f = await fixture(),
    update = f.update("暂存");
  expect(await f.session.stage(update, undefined, "same-operation")).toBe("same-operation");
  expect(await f.session.stage(update, undefined, "same-operation")).toBe("same-operation");
  expect(f.session.snapshot().pending).toHaveLength(1);
  await expect(
    f.session.stage(f.update("不同"), undefined, "same-operation")
  ).rejects.toMatchObject({ code: "OPERATION_IDENTITY_CONFLICT" });
  await f.session.flush();
  expect(await f.session.stage(update, undefined, "same-operation")).toBe("same-operation");
  expect(f.session.snapshot().pending).toHaveLength(0);
});

it("成功回执只保存幂等信息，重开清除旧全文副本但保留未确认及被拒材料", async () => {
  const f = await fixture();
  let first!: Uint8Array;
  for (let i = 0; i < 50; i++) {
    const update = f.update("字");
    if (i === 0) first = update;
    await f.session.stage(update, undefined, `edit-${i}`);
    await f.session.flush();
  }
  const saved = (await f.remote.load())!;
  expect(saved).not.toHaveProperty("receipts");
  expect(f.journal.db.prepare("SELECT count(*) AS n FROM remote_receipts").get()).toEqual({
    n: 50,
  });
  const operations = await Promise.all(
    Array.from({ length: 50 }, (_, i) => f.remote.receipt(`edit-${i}`))
  );
  expect(
    operations.every(receipt => receipt && !("update" in receipt) && !("baseline" in receipt))
  ).toBe(true);
  await expect(f.session.stage(first, undefined, "edit-0")).resolves.toBe("edit-0");
  await expect(f.session.stage(f.update("不同内容"), undefined, "edit-0")).rejects.toThrow(
    "不能更换"
  );
  expect(f.session.snapshot().pending).toEqual([]);
  const legacy = {
    ...saved,
    receipts: operations.map(operation => ({
      ...operation,
      update: first,
      baseline: saved.confirmed,
    })),
    rejected: [{ reason: "retained", baseline: saved.confirmed, operations: [], state: first }],
  };
  await f.remote.save(legacy);
  const restored = await DocumentSyncSession.open(f.room.id, f.remote, f.transport);
  expect(restored.snapshot().rejected).toEqual(legacy.rejected);
  expect(await f.remote.load()).not.toHaveProperty("receipts");
  expect(await f.remote.receipt("edit-0")).not.toHaveProperty("baseline");
});

it("归档回执写入失败时保留待确认提案，重试只读原服务端终态", async () => {
  const f = await fixture();
  const id = await f.session.stage(f.update("原操作"));
  f.journal.db.exec(
    "CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON remote_receipts BEGIN SELECT RAISE(ABORT, 'disk full'); END"
  );
  await expect(f.session.flush()).rejects.toThrow("disk full");
  expect(f.session.snapshot().pending).toHaveLength(1);
  expect((await f.remote.load())?.pending).toHaveLength(1);
  expect(await f.remote.receipt(id)).toBeNull();
  expect(f.store.operations.sequence(f.room.id)).toBe(1);
  f.journal.db.exec("DROP TRIGGER fail_receipt");
  await f.session.flush();
  expect(f.session.snapshot().pending).toHaveLength(0);
  expect(await f.remote.receipt(id)).toMatchObject({ state: "COMMITTED" });
  expect(f.store.operations.sequence(f.room.id)).toBe(1);
});
