// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";
import { WhiteboardModel } from "@tau/collaboration";
import { ContentIdentityTable } from "../../../../src-electron/main/modules/tables/content-identity";
import { WhiteboardJournal } from "../../../../src-electron/main/modules/whiteboard-documents/journal";
import { WhiteboardDocumentSessions } from "../../../../src-electron/main/modules/whiteboard-documents/sessions";
import {
  WhiteboardDocumentClient,
  type PendingWhiteboardUpdate,
  type WhiteboardOutbox,
  type WhiteboardDocumentBackend,
} from "../client";
import type {
  WhiteboardDocumentEvent,
  WhiteboardDocumentFlushRequest,
  WhiteboardDocumentResume,
} from "@/types/whiteboard-document";
const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach(fn => fn())
);
class Outbox implements WhiteboardOutbox {
  records = new Map<string, PendingWhiteboardUpdate>();
  fail = false;
  async list(databaseName: string, documentId: string) {
    return [...this.records.values()]
      .filter(record => record.databaseName === databaseName && record.documentId === documentId)
      .map(record => structuredClone(record));
  }
  async put(record: PendingWhiteboardUpdate) {
    if (this.fail) throw new Error("outbox full");
    this.records.set(record.batchId, structuredClone(record));
  }
  async remove(id: string) {
    this.records.delete(id);
  }
}
async function fixture() {
  const db = new Database(":memory:");
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  const journal = new WhiteboardJournal(":memory:");
  const events = new Map<number, Set<(event: WhiteboardDocumentEvent) => void>>();
  const sessions = new WhiteboardDocumentSessions(
    journal,
    () => db,
    (owner, event) => events.get(owner)?.forEach(listener => listener(event))
  );
  const source = new Y.Doc(),
    model = new WhiteboardModel(source),
    contract = await prepareWhiteboardContract("example", {
      type: "shape",
      dataVersion: 1,
      collaboration: { textFields: ["source"] },
    });
  await model.installContracts({ [contract.id]: contract.contract });
  const page = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0],
    id = model.submit(
      [
        {
          type: "create",
          contractId: contract.id,
          data: {},
          geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          parent: { kind: "page", id: page },
        },
      ],
      null
    ).createdIds[0];
  const { contentIds } = await sessions.create("A", "doc", Y.encodeStateAsUpdate(source), "board");
  cleanups.push(() => {
    sessions.dispose();
    source.destroy();
    journal.close();
    db.close();
  });
  const outbox = new Outbox();
  const backend = (owner: number) => {
    const listeners = new Set<(event: WhiteboardDocumentEvent) => void>();
    events.set(owner, listeners);
    const drains = new Set<(event: WhiteboardDocumentFlushRequest) => void>(),
      resumes = new Set<(event: WhiteboardDocumentResume) => void>();
    const api: WhiteboardDocumentBackend = {
      open: (target, viewId) => sessions.open(target.databaseName, target.contentId, owner, viewId),
      append: vi.fn((lease, batch, update) => sessions.append(lease, owner, batch, update)),
      flush: vi.fn(lease => sessions.flush(lease, owner)),
      snapshot: lease => Promise.resolve(sessions.snapshot(lease, owner)),
      release: vi.fn(lease => sessions.release(lease, owner)),
      events: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      drains: listener => {
        drains.add(listener);
        return () => drains.delete(listener);
      },
      resumes: listener => {
        resumes.add(listener);
        return () => resumes.delete(listener);
      },
      drained: vi.fn(async () => {}),
    };
    return { api, drains, resumes, listeners };
  };
  const open = async (owner = 1, api = backend(owner).api) => {
    const client = new WhiteboardDocumentClient(
      { databaseName: "A", contentId: contentIds[0] },
      api,
      outbox
    );
    cleanups.push(() => client.dispose());
    await client.ready;
    return client;
  };
  return { db, journal, sessions, outbox, backend, open, id, contentId: contentIds[0] };
}
const edit = (client: WhiteboardDocumentClient, id: string, text: string) =>
  client.model.submit(
    [
      {
        type: "edit_text",
        id,
        field: "source",
        edit: { offset: client.model.text(id, "source").length, remove: 0, text },
      },
    ],
    {}
  );
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("W4 渲染会话与耐久待发送队列", () => {
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
