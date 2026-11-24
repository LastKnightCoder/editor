// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { exportWhiteboardTransfer, prepareWhiteboardTransfer } from "@tau/collaboration";
import { cleanups, cleanupClients, edit, fixture, applyUnstagedBatch } from "./client-fixture";

afterEach(() => {
  cleanupClients();
  vi.restoreAllMocks();
});

it.each(["粘贴", "整板导入", "复制页面"])(
  "%s 后不继续编辑也能保存，后续编辑与撤销重做均可重开读回",
  async operation => {
    const f = await fixture(),
      backend = f.backend(1),
      snapshot = vi.spyOn(backend.api, "snapshot"),
      client = await f.open(1, backend.api);
    edit(client, f.id, "原文");
    await client.flush();
    const pack = exportWhiteboardTransfer(client.model, "doc", [f.id]);
    const plan = await prepareWhiteboardTransfer(client.model, pack, {
      targetDocumentId: "doc",
      ...(operation === "粘贴" ? { pageId: f.page } : {}),
    });
    const origin = {},
      history = client.model.createUndoManager({
        trackedOrigins: new Set([origin]),
        captureTimeout: 0,
      });
    cleanups.push(() => history.destroy());
    client.model.submitChunks(plan.commands, origin, plan.prepared, plan.initialBodies);
    const copied = plan.ids.get(f.id)!;
    await client.flush();
    let reopened = await f.open(2);
    expect(reopened.model.text(copied, "source").toString()).toBe("原文");
    expect(
      reopened.model
        .read()
        .pages.flatMap(page => page.children)
        .map(node => node.id)
    ).toEqual(expect.arrayContaining([f.id, copied]));
    await reopened.release();
    history.undo();
    await client.flush();
    reopened = await f.open(3);
    expect(
      reopened.model
        .read()
        .pages.flatMap(page => page.children)
        .map(node => node.id)
    ).toEqual([f.id]);
    await reopened.release();
    history.redo();
    edit(client, copied, "·编辑");
    await client.flush();
    reopened = await f.open(4);
    expect(reopened.model.text(copied, "source").toString()).toBe("原文·编辑");
    expect(reopened.model.text(f.id, "source").toString()).toBe("原文");
    expect(f.outbox.records.size).toBe(0);
    expect(snapshot).not.toHaveBeenCalled();
  }
);

it("存活窗口补齐漏掉的创建，保留另一窗口并发编辑并恢复耐久保存", async () => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api),
    other = await f.open(2);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  expect(f.outbox.records.size).toBe(0);
  expect(f.sessions.snapshot(client.leaseId!, 1).revision).toBe(0);
  edit(other, f.id, "另一窗口");
  await other.flush();
  edit(client, id, "·继续");
  await client.flush();
  const reopened = await f.open(3);
  expect(reopened.model.text(id, "source").toString()).toBe("数据治理·继续");
  expect(reopened.model.text(f.id, "source").toString()).toBe("另一窗口");
  expect(client.getSnapshot()).toMatchObject({ phase: "saved", pending: 0 });
  expect(f.outbox.records.size).toBe(0);
});

it("补齐材料先入草稿，发送失败后重建渲染进程仍能完整恢复", async () => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  const append = backend.api.append;
  let calls = 0;
  backend.api.append = async (...args) => {
    if (++calls > 1) throw new Error("IPC offline after repair");
    return append(...args);
  };
  edit(client, id, "·草稿");
  await expect(client.flush()).rejects.toThrow("IPC offline after repair");
  expect(f.outbox.records.size).toBeGreaterThan(1);
  client.dispose();
  f.sessions.abandon(1);
  const reopened = await f.open(2);
  await reopened.flush();
  expect(reopened.model.text(id, "source").toString()).toBe("数据治理·草稿");
  expect(f.outbox.records.size).toBe(0);
});

it("补齐成功但回执丢失时重试同一材料，不重复创建或推进修订", async () => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  const append = backend.api.append;
  let lose = true;
  backend.api.append = async (...args) => {
    const receipt = await append(...args);
    if (lose) throw new Error("ack lost");
    return receipt;
  };
  edit(client, id, "·回执");
  await expect(client.flush()).rejects.toThrow("ack lost");
  const revision = f.sessions.snapshot(client.leaseId!, 1).revision;
  lose = false;
  await client.flush();
  expect(f.sessions.snapshot(client.leaseId!, 1).revision).toBe(revision);
  const reopened = await f.open(2);
  expect(reopened.model.read().pages[0].children.filter(node => node.id === id)).toHaveLength(1);
  expect(reopened.model.text(id, "source").toString()).toBe("数据治理·回执");
});

it.each(["databaseName", "documentId", "sourceId", "baselineId", "epoch"] as const)(
  "补齐快照的 %s 变化时拒绝混入，原草稿逐字节保留",
  async field => {
    const f = await fixture(),
      backend = f.backend(1),
      client = await f.open(1, backend.api);
    const { id } = applyUnstagedBatch(client, f.contract.id);
    const snapshot = backend.api.snapshot;
    backend.api.snapshot = async lease => {
      const result = await snapshot(lease);
      if (field === "epoch") result.identity.epoch++;
      else result.identity[field] += "-other";
      return result;
    };
    edit(client, id, "·原草稿");
    const before = [...f.outbox.records.values()].map(record => structuredClone(record));
    await expect(client.flush()).rejects.toThrow("基线已变化");
    expect([...f.outbox.records.values()]).toEqual(before);
    expect(f.sessions.snapshot(client.leaseId!, 1).revision).toBe(0);
  }
);

it("补齐仍缺依赖时结束本轮保存并保留材料，不无限重试", async () => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  backend.api.append = vi.fn(async () => {
    throw new Error("Error invoking remote method: MISSING_DEPENDENCIES: retained");
  });
  edit(client, id, "·保留");
  await expect(client.flush()).rejects.toThrow("MISSING_DEPENDENCIES");
  expect(backend.api.append).toHaveBeenCalledTimes(2);
  expect(f.outbox.records.size).toBe(2);
  expect(client.model.text(id, "source").toString()).toBe("数据治理·保留");
});

it("窗口已关闭且只剩残缺旧草稿时不伪造恢复或清空原记录", async () => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  backend.api.append = async () => {
    throw new Error("IPC offline");
  };
  edit(client, id, "·残缺");
  await expect(client.flush()).rejects.toThrow("IPC offline");
  const before = [...f.outbox.records.values()].map(record => structuredClone(record));
  client.dispose();
  f.sessions.abandon(1);
  await expect(f.open(2)).rejects.toThrow("草稿缺少依赖");
  expect([...f.outbox.records.values()]).toEqual(before);
});

it("连续多笔草稿写入失败后一次重试即可重写整队，不逐个重放过期的失败", async () => {
  const f = await fixture(),
    client = await f.open();
  f.outbox.fail = true;
  edit(client, f.id, "甲");
  edit(client, f.id, "乙");
  edit(client, f.id, "丙");
  await expect(client.flush()).rejects.toThrow("outbox full");
  expect(client.getSnapshot().pending).toBe(3);
  f.outbox.fail = false;
  await client.flush();
  const reopened = await f.open(2);
  expect(reopened.model.text(f.id, "source").toString()).toBe("甲乙丙");
  expect(f.outbox.records.size).toBe(0);
});

it.each(["snapshot", "outbox"])("补齐时 %s 失败保留原材料，恢复后一次重试可保存", async failure => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  const snapshot = backend.api.snapshot;
  backend.api.snapshot = async lease => {
    if (failure === "snapshot") throw new Error("snapshot offline");
    const result = await snapshot(lease);
    f.outbox.fail = true;
    return result;
  };
  edit(client, id, "·待恢复");
  const original = [...f.outbox.records.values()].map(record => structuredClone(record));
  await expect(client.flush()).rejects.toThrow(/snapshot offline|outbox full/);
  for (const record of original) expect(f.outbox.records.get(record.batchId)).toEqual(record);
  backend.api.snapshot = snapshot;
  f.outbox.fail = false;
  await client.flush();
  const reopened = await f.open(2);
  expect(reopened.model.text(id, "source").toString()).toBe("数据治理·待恢复");
  expect(f.outbox.records.size).toBe(0);
});

it("读取补齐快照期间继续输入，保存也排空晚到的内容", async () => {
  const f = await fixture(),
    backend = f.backend(1),
    client = await f.open(1, backend.api);
  const { id } = applyUnstagedBatch(client, f.contract.id);
  const snapshot = backend.api.snapshot;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  backend.api.snapshot = vi.fn(async lease => {
    await gate;
    return snapshot(lease);
  });
  edit(client, id, "·先");
  const saving = client.flush();
  await vi.waitFor(() => expect(backend.api.snapshot).toHaveBeenCalled());
  edit(client, id, "·后");
  edit(client, f.id, "独立修改");
  release();
  await saving;
  const reopened = await f.open(2);
  expect(reopened.model.text(id, "source").toString()).toBe("数据治理·先·后");
  expect(reopened.model.text(f.id, "source").toString()).toBe("独立修改");
  expect(f.outbox.records.size).toBe(0);
});
