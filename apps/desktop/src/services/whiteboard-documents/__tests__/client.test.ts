// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createWhiteboardDocument, WhiteboardModel } from "@tau/collaboration";
import { WhiteboardDocumentClient } from "../client";
import type { WhiteboardDocumentEvent } from "@/types/whiteboard-document";
import { cleanups, cleanupClients, fixture, edit } from "./client-fixture";
afterEach(cleanupClients);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("W4 渲染会话与耐久待发送队列", () => {
  it("关闭会话立即拒绝保存，最后一个画布清理后才销毁模型且只销毁一次", async () => {
    const f = await fixture();
    const client = await f.open();
    const releaseFirst = client.retainModel();
    const releaseSecond = client.retainModel();
    const dispose = vi.spyOn(client.model, "dispose");
    client.dispose();
    expect(client.isDisposed).toBe(true);
    await expect(client.flush()).rejects.toThrow("白板会话已关闭");
    expect(client.model.read().pages).toHaveLength(1);
    releaseFirst();
    await tick();
    expect(dispose).not.toHaveBeenCalled();
    releaseSecond();
    releaseSecond();
    expect(client.model.read().pages).toHaveLength(1);
    await tick();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => client.model.read()).toThrow("白板文档已释放");
    expect(client.getSummary()).toEqual({ title: "", pageCount: 1 });
  });

  it("跨会话草稿按因果整体恢复并补发，反向窗口身份不丢输入", async () => {
    const f = await fixture(),
      firstBackend = f.backend(1);
    firstBackend.api.append = vi.fn(async () => {
      throw new Error("IPC offline");
    });
    const first = await f.open(1, firstBackend.api);
    edit(first, f.id, "甲");
    await expect(first.flush()).rejects.toThrow("IPC offline");
    first.dispose();
    f.sessions.abandon(1);
    const secondBackend = f.backend(2);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    secondBackend.api.append = vi.fn(async () => {
      await gate;
      throw new Error("IPC offline");
    });
    const second = await f.open(2, secondBackend.api);
    expect(second.getSnapshot().phase).toBe("saving");
    edit(second, f.id, "乙");
    const saving = second.flush().catch(() => undefined);
    await tick();
    for (const record of f.outbox.records.values())
      record.clientId = record.clientId === first.viewId ? "z-first" : "a-second";
    second.dispose();
    release();
    await saving;
    f.sessions.abandon(2);
    const backend = f.backend(3),
      append = backend.api.append;
    let lost = true;
    backend.api.append = async (...args) => {
      const receipt = await append(...args);
      if (lost) throw new Error("ack lost");
      return receipt;
    };
    const restored = await f.open(3, backend.api);
    expect(restored.model.text(f.id, "source").toString()).toBe("甲乙");
    await expect(restored.flush()).rejects.toThrow("ack lost");
    expect(f.outbox.records.size).toBe(2);
    lost = false;
    await restored.flush();
    expect(f.outbox.records.size).toBe(0);
    expect(f.journal.db.prepare("SELECT count(*) AS n FROM updates").get()).toEqual({ n: 1 });
  });
  it("本机编辑经日志及投影回执后才显示已保存，远端事件不再次发送", async () => {
    const f = await fixture(),
      a = f.backend(1),
      client = await f.open(1, a.api);
    edit(client, f.id, "甲");
    expect(client.getSnapshot().phase).toBe("saving");
    await client.flush();
    expect(client.getSnapshot()).toMatchObject({
      phase: "saved",
      revision: 1,
      projectedRevision: 1,
      pending: 0,
    });
    expect(a.api.append).toHaveBeenCalledTimes(1);
    expect(f.outbox.records.size).toBe(0);
  });
  it("outbox 写入失败保留内存，不向主进程发送，重试后不丢输入", async () => {
    const f = await fixture(),
      a = f.backend(1),
      client = await f.open(1, a.api);
    f.outbox.fail = true;
    edit(client, f.id, "保留");
    await expect(client.flush()).rejects.toThrow("outbox full");
    expect(a.api.append).not.toHaveBeenCalled();
    expect(client.getSnapshot().pending).toBe(1);
    f.outbox.fail = false;
    await client.flush();
    expect(client.model.text(f.id, "source").toString()).toBe("保留");
  });
  it("回执丢失后使用同一批次重试，日志只有一条", async () => {
    const f = await fixture(),
      a = f.backend(1),
      append = a.api.append;
    let lose = true;
    a.api.append = async (...args) => {
      const result = await append(...args);
      if (lose) throw new Error("ack lost");
      return result;
    };
    const client = await f.open(1, a.api);
    edit(client, f.id, "一次");
    await expect(client.flush()).rejects.toThrow("ack lost");
    expect(f.outbox.records.size).toBe(1);
    lose = false;
    await client.flush();
    expect(f.journal.db.prepare("SELECT COUNT(*) AS n FROM updates").get()).toEqual({ n: 1 });
    expect(client.getSnapshot().phase).toBe("saved");
  });
  it("第一批 IPC 失败时后续输入也先进入持久队列，渲染进程重建可恢复全部", async () => {
    const f = await fixture(),
      a = f.backend(1);
    a.api.append = vi.fn(async () => {
      throw new Error("IPC offline");
    });
    const client = await f.open(1, a.api);
    edit(client, f.id, "甲");
    edit(client, f.id, "乙");
    edit(client, f.id, "丙");
    await expect(client.flush()).rejects.toThrow("IPC offline");
    await tick();
    expect(f.outbox.records.size).toBe(3);
    client.dispose();
    f.sessions.abandon(1);
    const restored = await f.open(2);
    await restored.flush();
    expect(restored.model.text(f.id, "source").toString()).toBe("甲乙丙");
    expect(f.outbox.records.size).toBe(0);
  });
  it("日志成功但投影失败可见报告，关闭失败仍保留主进程持有", async () => {
    const f = await fixture(),
      a = f.backend(1),
      client = await f.open(1, a.api);
    f.db.exec(
      "CREATE TRIGGER fail BEFORE UPDATE ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'disk error'); END;"
    );
    edit(client, f.id, "耐久");
    await expect(client.flush()).rejects.toThrow("disk error");
    expect(client.getSnapshot()).toMatchObject({
      phase: "error",
      revision: 1,
      projectedRevision: 0,
    });
    await expect(client.release()).rejects.toThrow();
    expect(f.sessions.holders()).toHaveLength(1);
    expect(f.outbox.records.size).toBe(0);
    f.db.exec("DROP TRIGGER fail");
    await client.release();
    expect(f.sessions.holders()).toHaveLength(0);
  });
  it("两窗口在同一主进程文档合并，释放一方不影响另一方", async () => {
    const f = await fixture(),
      a = f.backend(1),
      b = f.backend(2),
      left = await f.open(1, a.api),
      right = await f.open(2, b.api);
    edit(left, f.id, "甲");
    edit(right, f.id, "乙");
    await Promise.all([left.flush(), right.flush()]);
    await tick();
    expect(left.model.read()).toEqual(right.model.read());
    expect(a.api.append).toHaveBeenCalledTimes(1);
    expect(b.api.append).toHaveBeenCalledTimes(1);
    await left.release();
    edit(right, f.id, "丙");
    await right.flush();
    expect(right.model.text(f.id, "source").toString()).toContain("丙");
  });
  it("关闭屏障冻结输入状态，排空后才回执；取消关闭可恢复", async () => {
    const f = await fixture(),
      a = f.backend(1),
      client = await f.open(1, a.api);
    edit(client, f.id, "尾部");
    a.drains.forEach(listener =>
      listener({ leaseId: client.leaseId!, requestId: "close", sealed: true })
    );
    await vi.waitFor(() => expect(a.api.drained).toHaveBeenCalledWith("close"));
    expect(client.getSnapshot()).toMatchObject({ frozen: true, pending: 0, phase: "saved" });
    a.resumes.forEach(listener => listener({ leaseId: client.leaseId!, requestId: "close" }));
    expect(client.getSnapshot().frozen).toBe(false);
  });
  it("已有 flush 期间的新输入也要排空，不能返回旧的成功", async () => {
    const f = await fixture(),
      a = f.backend(1);
    let unblock!: () => void;
    const gate = new Promise<void>(resolve => {
      unblock = resolve;
    });
    const original = a.api.flush;
    let calls = 0;
    a.api.flush = async lease => {
      if (++calls === 1) await gate;
      return original(lease);
    };
    const client = await f.open(1, a.api);
    edit(client, f.id, "一");
    const saving = client.flush();
    await vi.waitFor(() => expect(calls).toBe(1));
    edit(client, f.id, "二");
    const closing = client.flush();
    unblock();
    await Promise.all([saving, closing]);
    expect(f.outbox.records.size).toBe(0);
    expect(client.getSnapshot()).toMatchObject({ phase: "saved", revision: 2, pending: 0 });
  });
  it("安装共享新代次后遗留的旧草稿不能盖过已保存内容或阻塞新的编辑", async () => {
    const f = await fixture();
    const local = await f.open(1);
    const doc = await createWhiteboardDocument(
      { documentId: "room", epoch: 2, baselineId: "second" },
      Y.encodeStateAsUpdate(local.doc)
    );
    try {
      const created = await f.sessions.create("A", "shared", Y.encodeStateAsUpdate(doc), "board");
      f.db.prepare("UPDATE whiteboard_documents SET epoch=2 WHERE document_id='shared'").run();
      const view = await f.sessions.open("A", created.contentIds[0], 5, "inspect");
      await f.sessions.release(view.leaseId, 5);
      const { identity } = view;
      f.outbox.records.set("old", {
        batchId: "old",
        databaseName: "A",
        documentId: "shared",
        clientId: "old",
        sequence: 1,
        scope: JSON.stringify(["A", "shared", identity.sourceId, identity.baselineId, 1]),
        update: new Uint8Array([255]),
      });
      const client = new WhiteboardDocumentClient(
        { databaseName: "A", contentId: created.contentIds[0] },
        f.backend(6).api,
        f.outbox
      );
      cleanups.push(() => client.dispose());
      await client.ready;
      edit(client, f.id, "新代次");
      await client.flush();
      expect(client.model.text(f.id, "source").toString()).toBe("新代次");
      expect(f.outbox.records.has("old")).toBe(true);
    } finally {
      doc.destroy();
    }
  });
  it("已保存在草稿箱但无法写入旧基线的输入，换代时只交给离线副本", async () => {
    const f = await fixture(),
      backend = f.backend(1);
    backend.api.append = async () => {
      throw new Error("旧基线拒绝写入");
    };
    const client = await f.open(1, backend.api);
    const base = f.sessions.snapshot(client.leaseId!, 1).state;
    edit(client, f.id, "离线补存");
    await expect(client.flush()).rejects.toThrow("旧基线");
    backend.drains.forEach(drain =>
      drain({ requestId: "rebind", leaseId: client.leaseId!, sealed: true, recoverOffline: true })
    );
    await vi.waitFor(() =>
      expect(backend.api.drained).toHaveBeenCalledWith("rebind", undefined, expect.any(Uint8Array))
    );
    const delta = vi.mocked(backend.api.drained).mock.calls.at(-1)?.[2];
    if (!delta) throw new Error("未交接旧草稿");
    const copy = new WhiteboardModel(new Y.Doc());
    try {
      Y.applyUpdate(copy.doc, base);
      expect(copy.text(f.id, "source").toString()).toBe("");
      Y.applyUpdate(copy.doc, delta);
      expect(copy.text(f.id, "source").toString()).toBe("离线补存");
      expect(f.outbox.records.size).toBe(1);
    } finally {
      copy.doc.destroy();
    }
  });
  it("其它基线草稿不自动套入当前文档，记录保留", async () => {
    const f = await fixture();
    f.outbox.records.set("old", {
      batchId: "old",
      scope: "old-baseline",
      databaseName: "A",
      documentId: "doc",
      clientId: "old",
      sequence: 1,
      update: new Uint8Array([0, 0]),
    });
    const client = new WhiteboardDocumentClient(
      { databaseName: "A", contentId: f.contentId },
      f.backend(1).api,
      f.outbox
    );
    cleanups.push(() => client.dispose());
    await expect(client.ready).rejects.toThrow("另一基线");
    expect(f.outbox.records.has("old")).toBe(true);
  });
});

it.each(["sourceId", "baselineId", "epoch"] as const)(
  "忽略同名文档另一 %s 的迟到事件，不混入当前基线",
  async field => {
    const f = await fixture(),
      backend = f.backend(1),
      client = await f.open(1, backend.api);
    const foreign = new Y.Doc();
    Y.applyUpdate(foreign, Y.encodeStateAsUpdate(client.doc));
    const model = new WhiteboardModel(foreign);
    model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "旧库事件" } }], {});
    const before = client.model.read();
    const event: WhiteboardDocumentEvent = {
      ...client.identity!,
      revision: 99,
      projectedRevision: 99,
      update: Y.encodeStateAsUpdate(foreign),
    };
    if (field === "epoch") event.epoch++;
    else event[field] = "different";
    backend.listeners.forEach(listener => listener(event));
    await client.flush();
    expect(client.model.read()).toEqual(before);
    expect(client.getSnapshot().revision).toBe(0);
    expect(backend.api.append).not.toHaveBeenCalled();
    model.dispose();
    foreign.destroy();
  }
);

it("关闭前先提交插件字段的组合输入，冻结后才确认已排空", async () => {
  const f = await fixture(),
    a = f.backend(1),
    client = await f.open(1, a.api);
  let draft = "组合输入";
  client.registerInputFlush(() => {
    if (!draft) return;
    expect(client.getSnapshot().frozen).toBe(false);
    edit(client, f.id, draft);
    draft = "";
  });
  a.drains.forEach(listener =>
    listener({ leaseId: client.leaseId!, requestId: "ime", sealed: true })
  );
  await vi.waitFor(() => expect(a.api.drained).toHaveBeenCalledWith("ime"));
  expect(client.model.text(f.id, "source").toString()).toBe("组合输入");
  expect(client.getSnapshot()).toMatchObject({ phase: "saved", frozen: true, pending: 0 });
});
it("插件输入提交抛错时不返回成功关闭回执", async () => {
  const f = await fixture(),
    a = f.backend(1),
    client = await f.open(1, a.api);
  client.registerInputFlush(() => {
    throw new Error("输入提交失败");
  });
  a.drains.forEach(listener =>
    listener({ leaseId: client.leaseId!, requestId: "failed-input", sealed: true })
  );
  await vi.waitFor(() =>
    expect(a.api.drained).toHaveBeenCalledWith("failed-input", "输入提交失败")
  );
  expect(a.api.release).not.toHaveBeenCalled();
  expect(client.isDisposed).toBe(false);
});
