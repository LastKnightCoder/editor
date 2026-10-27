// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createNodeDocument, NodeTree, type CollaborationSession } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { CollaborationLocalStore } from "../local-store";
import { NodeSessionUpdates } from "../node-session-updates";
import { ContentLocalState } from "../content-local-state";
import type { RuntimeSession } from "../types";

const directory = (store: CollaborationLocalStore) =>
  (store as unknown as { directory: string }).directory;

const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run());
});
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-node-updates-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const store = new CollaborationLocalStore(directory);
  cleanup.push(() => store.db.close());
  const state = new ContentLocalState(store.db);
  const definition = await prepareContentContract("example", {
    type: "example.source",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["code"] },
  });
  const doc = await createNodeDocument(
    { documentId: "document", baselineId: "baseline", epoch: 0 },
    {
      title: "标题",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "example.source",
          collabId: "source",
          tauContract: definition.id,
          code: "原文",
          children: [{ text: "" }],
        },
      ],
    },
    { [definition.id]: definition.contract }
  );
  const peer = new NodeTree(new Y.Doc());
  Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(doc));
  cleanup.push(() => {
    doc.destroy();
    peer.dispose();
    peer.doc.destroy();
  });
  const info: CollaborationSession = {
    id: "document",
    title: "标题",
    ownerId: "local",
    role: "owner",
    status: "active",
    members: [],
    updatedAt: 0,
    serverUrl: "",
    connection: "connected",
    pending: false,
    leaving: false,
    mode: "local",
  };
  store.create(info, doc);
  const session = { info, doc } as RuntimeSession;
  const queue = new NodeSessionUpdates(store, state);
  const update = () => {
    const before = Y.encodeStateVector(peer.doc);
    peer.textField("source", "code").insert(2, "新增");
    return Y.encodeStateAsUpdate(peer.doc, before);
  };
  return { store, state, session, peer, queue, update };
}

describe("协议 2 桌面增量接纳", () => {
  it("未确认的整份视图独立保存，迟到旧批次不覆盖；只有原代次已耐久包含全部操作才确认", async () => {
    const { state, session, peer, queue, update, store } = await setup();
    const identity = {
      workspaceId: "workspace",
      documentId: session.info.id,
      baselineId: "baseline",
      epoch: 0,
    };
    const bytes = update();
    const snapshot = Y.encodeStateAsUpdate(peer.doc);
    state.saveDocumentDraft(identity, "view", { state: snapshot, sequence: 2 });
    state.saveDocumentDraft(identity, "view", {
      state: Y.encodeStateAsUpdate(session.doc),
      sequence: 1,
    });
    expect(state.documentDrafts("workspace")[0].state).toEqual(Buffer.from(snapshot));
    queue.confirmDrafts(session.doc, session.info.id);
    expect(state.hasDocumentDrafts("workspace")).toBe(true);
    const failure = vi.spyOn(store, "append").mockImplementation(() => {
      throw new Error("磁盘满");
    });
    await expect(queue.apply(session, bytes, () => {})).rejects.toThrow("磁盘满");
    expect(state.hasDocumentDrafts("workspace")).toBe(true);
    failure.mockRestore();
    await queue.apply(session, bytes, () => {});
    expect(state.hasDocumentDrafts("workspace")).toBe(false);
    state.saveDocumentDraft({ ...identity, epoch: 1 }, "other-view", {
      state: snapshot,
      sequence: 1,
    });
    queue.confirmDrafts(session.doc, session.info.id);
    expect(state.documentDrafts("workspace")).toHaveLength(1);
    expect(() =>
      state.saveDocumentDraft(identity, "other-view", { state: snapshot, sequence: 3 })
    ).toThrow("来源已变化");
  });
  it("保存先于内存应用，重复请求不会丢字，缓存摘要损坏明确拒绝", async () => {
    const { store, session, queue, update } = await setup();
    const bytes = update();
    await queue.apply(session, bytes, () => {});
    await queue.apply(session, bytes, () => {});
    const loaded = store.load(session.info.id),
      tree = new NodeTree(loaded.doc);
    try {
      expect(tree.nodeSnapshot("source").code).toBe("原文新增");
    } finally {
      tree.dispose();
      loaded.doc.destroy();
    }
    store.db.prepare("UPDATE sessions SET state_hash=? WHERE id=?").run("bad", session.info.id);
    expect(() => store.load(session.info.id)).toThrow("摘要");
    expect(store.list()).toHaveLength(1);
  });

  it("落盘失败不修改当前正文，暂停写入后不接受排队中的旧编辑", async () => {
    const { store, session, queue, update } = await setup();
    const before = Y.encodeStateAsUpdate(session.doc);
    const append = vi.spyOn(store, "append").mockImplementation(() => {
      throw new Error("磁盘满");
    });
    await expect(queue.apply(session, update(), () => {})).rejects.toThrow("磁盘满");
    expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
    append.mockRestore();
    let checks = 0;
    await expect(
      queue.apply(session, Y.encodeStateAsUpdate(session.doc), () => {
        if (++checks > 1) throw new Error("已冻结");
      })
    ).rejects.toThrow("已冻结");
    expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
  });

  it("异步校验期间的纯删除也触发重验，不仅比较不变的状态向量", async () => {
    const { session, queue, update, store } = await setup();
    let checks = 0;
    await queue.apply(session, update(), () => {
      if (++checks === 1) queueMicrotask(() => session.doc.getText("title").delete(0, 1));
    });
    expect(checks).toBe(4);
    expect(session.doc.getText("title").toString()).toBe("题");
    const loaded = store.load(session.info.id);
    try {
      expect(loaded.doc.getText("title").toString()).toBe("题");
    } finally {
      loaded.doc.destroy();
    }
  });

  it("坏会话元数据备份后丢弃，不妨碍列出其他会话", async () => {
    const { store, session } = await setup();
    store.create({ ...session.info, id: "healthy" }, session.doc);
    store.db.prepare("UPDATE sessions SET metadata='bad' WHERE id=?").run(session.info.id);
    expect(store.list().map(info => info.id)).toEqual(["healthy"]);
    expect(store.db.prepare("SELECT 1 FROM sessions WHERE id='document'").get()).toBeUndefined();
    const discarded = join(directory(store), "discarded");
    const [file] = readdirSync(discarded);
    const backup = JSON.parse(readFileSync(join(discarded, file), "utf8"));
    expect(backup).toMatchObject({ id: "document", metadata: "bad" });
    expect(backup.state.length).toBeGreaterThan(0);
  });
});
