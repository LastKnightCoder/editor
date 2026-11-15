// @vitest-environment node
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { NodeTree, readNodeDocument, type ContentNode } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { withNodeTree } from "@tau/editor-collab";
import schema from "@tau/db-schema/schema/main.sql?raw";
import agentSchema from "@tau/db-schema/schema/content-agent.sql?raw";
import type { ContentSessionRuntime } from "../../content-runtime";
import { createLocalContentRuntime } from "../../content-runtime/composition";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import { replaceContent } from "../../tables/content-replacement";
import { CollaborationLocalStore } from "../local-store";
import { CollaborationAssetService } from "../asset-service";
import { contentRevision, unregisterContentSession } from "../content-sessions";
import type { RuntimeSession } from "../types";

const host = vi.hoisted(() => ({
  directory: "",
  databases: new Map<string, Database.Database>(),
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../database", () => ({
  default: { ...host, getDatabase: (name: string) => host.databases.get(name) },
}));
vi.mock("../../../utils/PathUtil", () => ({
  default: { getAppDir: () => host.directory },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

const cleanup: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) dispose();
  host.databases.clear();
});

type ProjectingRuntime = Pick<ContentSessionRuntime, "acceptUpdates"> & {
  drainDatabase: ContentSessionRuntime["drainDatabase"];
  project(session: RuntimeSession): Promise<void>;
};

const mainSnapshot = (db: Database.Database) =>
  Object.fromEntries(
    [
      "contents",
      "content_documents",
      "content_document_blocks",
      "content_document_node_blocks",
      "content_document_block_counts",
      "content_entity_relations",
      "white_board_contents",
      "white_board_content_pending_releases",
      "operation",
    ].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])
  );

function sqlContent(db: Database.Database): ContentNode[] {
  const row = db.prepare("SELECT content FROM content_snapshots WHERE id=7").get() as {
    content: string;
  };
  return JSON.parse(row.content);
}

function paragraphText(content: ContentNode[]): string {
  const paragraph = content.find(node => node.collabId === "paragraph");
  if (!paragraph || !Array.isArray(paragraph.children)) throw new Error("预期段落缺失");
  return paragraph.children.map(node => node.text).join("");
}

function candidateUpdate(session: RuntimeSession, prefix: string): Uint8Array {
  const doc = new Y.Doc({ gc: false });
  const tree = new NodeTree(doc);
  try {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(session.doc));
    const before = Y.encodeStateVector(doc);
    tree.insertText("paragraph", 0, prefix, {});
    return Y.encodeStateAsUpdate(doc, before);
  } finally {
    tree.dispose();
    doc.destroy();
  }
}

async function fixture(
  embedded = false,
  children: ContentNode[] = [{ type: "formatted", text: "甲乙" }]
) {
  const directory = mkdtempSync(join(tmpdir(), "tau-content-durability-baseline-"));
  host.directory = directory;
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const db = new Database(join(directory, "library.db"));
  cleanup.push(() => db.open && db.close());
  db.exec(schema);
  host.databases.set("library", db);
  db.exec(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(7,1,1,'[]',0,1)"
  );
  if (embedded)
    db.exec(
      "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES(21,1,1,'{}',0),(22,1,1,'{}',0)"
    );
  ContentIdentityTable.establishBaseline(db);
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const contracts = { [paragraph.id]: paragraph.contract };
  const content: ContentNode[] = [
    {
      type: "paragraph",
      collabId: "paragraph",
      tauContract: paragraph.id,
      children,
    },
  ];
  if (embedded) {
    const board = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    contracts[board.id] = board.contract;
    content.push({
      type: "whiteboard",
      collabId: "board",
      tauContract: board.id,
      entityRef: ContentIdentityTable.reference(db, "whiteboard-content", 21),
      children: [{ text: "" }],
    });
  }
  ContentDocumentTable.commit(
    db,
    7,
    { documentId: "durability-document", contracts, content },
    {
      installDocument: true,
      count: children.reduce((total, child) => total + (child.text?.length ?? 0), 0),
    }
  );

  const openRuntime = async () => {
    const journalDirectory = join(directory, "local-content");
    const store = new CollaborationLocalStore(journalDirectory, "content.db");
    store.db.exec(agentSchema);
    const assets = new CollaborationAssetService(store, directory, async () => {
      throw new Error("本机正文不得请求远端身份");
    });
    const runtime = createLocalContentRuntime(store, assets);
    const sessions = runtime["sessions"];
    const state = runtime["contentState"]!;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      runtime.shutdown();
      for (const session of sessions.values()) {
        unregisterContentSession(session);
        session.projectionTree?.dispose();
        session.awareness.destroy();
        session.doc.destroy();
      }
      store.db.close();
    };
    cleanup.push(close);
    const opened = await runtime.open({ db, name: "library" }, { contentId: 7 });
    const session = sessions.get(opened.documentId);
    if (!session) throw new Error("正文打开后未登记会话");
    return {
      runtime: runtime as unknown as ProjectingRuntime,
      session,
      store,
      state,
      assets,
      close,
    };
  };
  const active = await openRuntime();
  await active.runtime.project(active.session);
  return { db, directory, openRuntime, ...active };
}

describe("正文耐久与投影的独立基准", () => {
  it("资源准备中同名连接变更时，整篇替换在写草稿和日志前拒绝", async () => {
    const f = await fixture();
    const previous = mainSnapshot(f.db);
    const previousState = Y.encodeStateAsUpdate(f.session.doc);
    const localRows = () => [
      f.store.db.prepare("SELECT * FROM updates ORDER BY rowid").all(),
      f.store.db.prepare("SELECT * FROM document_drafts ORDER BY rowid").all(),
    ];
    const beforeLocal = localRows();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(f.assets, "prepareLocalDocument").mockImplementationOnce(async (_id, value) => {
      entered.resolve();
      await release.promise;
      return value;
    });
    const next = sqlContent(f.db);
    next[0].children = [{ type: "formatted", text: "过期的整篇替换" }];
    const accepted = vi.fn();
    const pending = replaceContent(
      f.db,
      7,
      { content: next as Descendant[], expectedRevision: contentRevision(f.session) },
      undefined,
      { onAccepted: accepted }
    );
    const rejected = expect(pending).rejects.toThrow("资料库连接已变化");
    await entered.promise;
    const other = new Database(":memory:");
    cleanup.push(() => other.close());
    host.databases.set("library", other);
    release.resolve();

    await rejected;
    expect(accepted).not.toHaveBeenCalled();
    expect(localRows()).toEqual(beforeLocal);
    expect(Y.encodeStateAsUpdate(f.session.doc)).toEqual(previousState);
    expect(mainSnapshot(f.db)).toEqual(previous);
  });

  it("草稿确认失败时，已写入日志的替换仍记录接纳来源", async () => {
    const f = await fixture();
    const next = sqlContent(f.db);
    next[0].children = [{ type: "formatted", text: "接纳后待投影" }];
    const accepted = vi.fn(() => {
      const cached = f.store.load(f.session.info.id);
      try {
        expect(paragraphText(readNodeDocument(cached.doc).content)).toBe("接纳后待投影");
      } finally {
        cached.doc.destroy();
      }
    });
    f.store.db.exec(`CREATE TEMP TRIGGER fail_full_write_draft_confirmation
      BEFORE UPDATE OF applied ON document_drafts
      BEGIN SELECT RAISE(ABORT, '注入替换草稿确认故障'); END`);
    await expect(
      replaceContent(
        f.db,
        7,
        { content: next as Descendant[], expectedRevision: contentRevision(f.session) },
        undefined,
        { onAccepted: accepted }
      )
    ).rejects.toThrow("注入替换草稿确认故障");

    expect(accepted).toHaveBeenCalledOnce();
    expect(paragraphText(sqlContent(f.db))).toBe("甲乙");
    expect(paragraphText(readNodeDocument(f.session.doc).content)).toBe("接纳后待投影");
    f.store.db.exec("DROP TRIGGER fail_full_write_draft_confirmation");
    await f.runtime.project(f.session);
    expect(paragraphText(sqlContent(f.db))).toBe("接纳后待投影");
  });

  it("已耐久但未投影的输入从文件重开恢复，重送同一增量不产生第二份业务效果", async () => {
    const f = await fixture();
    const update = candidateUpdate(f.session, "已确认🙂");
    await f.runtime.acceptUpdates(f.session, update, () => undefined);
    expect(paragraphText(sqlContent(f.db))).toBe("甲乙");
    const persisted = f.store.db
      .prepare("SELECT state FROM updates WHERE document_id=? ORDER BY id")
      .all(f.session.info.id) as { state: Buffer }[];
    expect(persisted.length).toBeGreaterThan(0);
    f.close();

    const reopened = await f.openRuntime();
    await reopened.runtime.acceptUpdates(reopened.session, update, () => undefined);
    await reopened.runtime.acceptUpdates(reopened.session, update, () => undefined);
    await reopened.runtime.project(reopened.session);
    expect(paragraphText(sqlContent(f.db))).toBe("已确认🙂甲乙");
    expect(
      f.db
        .prepare(
          "SELECT count(*) AS edits FROM operation WHERE operation_content_type='content' AND operation_action='update'"
        )
        .get()
    ).toEqual({ edits: 1 });
    expect(f.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("批红取消加粗和渐变后退出重开，只保留红色高亮", async () => {
    const highlighted = { type: "formatted", text: "批红", highlight: "red" };
    const f = await fixture(false, [
      { type: "formatted", text: "称为" },
      { ...highlighted, bold: true, textGradient: "ocean" },
      { type: "formatted", text: "，以此提高处理政务的效率。" },
    ]);
    const renderer = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(renderer, Y.encodeStateAsUpdate(f.session.doc));
      const before = Y.encodeStateVector(renderer);
      const editor = withNodeTree(createEditor(), new NodeTree(renderer), {});
      editor.connectNodeTree();
      Transforms.select(editor, Editor.range(editor, [0, 1]));
      Editor.removeMark(editor, "bold");
      Editor.removeMark(editor, "textGradient");
      expect(Editor.node(editor, [0, 1])[0]).toEqual(highlighted);
      const update = Y.encodeStateAsUpdate(renderer, before);
      await f.runtime.acceptUpdates(f.session, update, () => undefined);
    } finally {
      renderer.destroy();
    }

    const drain = await f.runtime.drainDatabase({ reason: "quit" });
    drain.commit();
    f.close();

    const reopened = await f.openRuntime();
    expect(sqlContent(f.db)[0].children?.[1]).toEqual(highlighted);
    expect(readNodeDocument(reopened.session.doc).content[0].children?.[1]).toEqual(highlighted);
  });

  it("日志增量和条件操作回执在同一事务失败，正式文档与未确认草稿保持原状", async () => {
    const f = await fixture();
    const update = candidateUpdate(f.session, "待确认");
    const peer = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(f.session.doc));
      Y.applyUpdate(peer, update);
      const meta = f.session.doc.getMap("meta");
      f.state.saveDocumentDraft(
        {
          workspaceId: "library",
          documentId: f.session.info.id,
          baselineId: String(meta.get("baselineId")),
          epoch: Number(meta.get("epoch")),
        },
        "draft-view",
        { state: Y.encodeStateAsUpdate(peer), sequence: 1 }
      );
    } finally {
      peer.destroy();
    }
    const before = Y.encodeStateAsUpdate(f.session.doc);
    const journalBefore = f.store.db.prepare("SELECT * FROM updates ORDER BY id").all();
    const receipt = "scoped-edit:durability-baseline";
    await expect(
      f.runtime.acceptUpdates(
        f.session,
        {
          bytes: update.byteLength,
          build: async () => update,
          commit: () => {
            f.store.set(receipt, { committed: true });
            throw new Error("故障切点：回执写入后、事务提交前");
          },
        },
        () => undefined
      )
    ).rejects.toThrow("事务提交前");
    expect(Y.encodeStateAsUpdate(f.session.doc)).toEqual(before);
    expect(f.store.db.prepare("SELECT * FROM updates ORDER BY id").all()).toEqual(journalBefore);
    expect(
      f.store.db.prepare("SELECT value FROM settings WHERE key=?").get(receipt)
    ).toBeUndefined();
    expect(f.state.hasDocumentDrafts("library")).toBe(true);

    await f.runtime.acceptUpdates(f.session, update, () => undefined);
    await f.runtime.project(f.session);
    expect(paragraphText(sqlContent(f.db))).toBe("待确认甲乙");
    expect(f.state.hasDocumentDrafts("library")).toBe(false);
  });

  it("关系计数已执行后修订写入失败，块、引用、计数、回收登记与编辑记录全部回滚", async () => {
    const f = await fixture(true);
    const tree = new NodeTree(f.session.doc);
    try {
      const next = ContentIdentityTable.reference(f.db, "whiteboard-content", 22);
      tree.setProperties("board", { entityRef: next }, {});
      const before = mainSnapshot(f.db);
      f.db.exec(
        "CREATE TEMP TRIGGER reject_revision BEFORE UPDATE OF revision ON content_documents BEGIN SELECT RAISE(ABORT,'故障切点：修订写入'); END;"
      );
      await expect(f.runtime.project(f.session)).rejects.toThrow("故障切点：修订写入");
      expect(mainSnapshot(f.db)).toEqual(before);
      expect(f.session.projectionDirty).toBe(true);
      f.db.exec("DROP TRIGGER reject_revision");
      await f.runtime.project(f.session);
      expect(
        f.db.prepare("SELECT id,ref_count FROM white_board_contents ORDER BY id").all()
      ).toEqual([
        { id: 21, ref_count: 0 },
        { id: 22, ref_count: 1 },
      ]);
      expect(
        f.db
          .prepare(
            "SELECT node_id,slot,source_id,entity_kind,entity_id FROM content_entity_relations"
          )
          .all()
      ).toEqual([
        {
          node_id: "board",
          slot: "entityRef",
          source_id: next.sourceId,
          entity_kind: "whiteboard-content",
          entity_id: next.entityId,
        },
      ]);
      expect(
        f.db.prepare("SELECT content_id FROM white_board_content_pending_releases").all()
      ).toEqual([{ content_id: 21 }]);
      expect(sqlContent(f.db).find(node => node.collabId === "board")?.entityRef).toEqual(next);
      expect(f.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      tree.dispose();
    }
  });

  it("资源等待期间到达的新输入不被旧投影确认，下一轮才进入主库", async () => {
    const f = await fixture();
    const tree = new NodeTree(f.session.doc);
    const localize = f.assets.localizeDocument.bind(f.assets);
    try {
      tree.insertText("paragraph", 0, "先到", {});
      vi.spyOn(f.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
        const value = await localize(...args);
        tree.insertText("paragraph", 0, "后到", {});
        return value;
      });
      await f.runtime.project(f.session);
      expect(paragraphText(sqlContent(f.db))).toBe("先到甲乙");
      expect(f.session.projectionDirty).toBe(true);
      await f.runtime.project(f.session);
      expect(paragraphText(sqlContent(f.db))).toBe("后到先到甲乙");
      expect(f.session.projectionDirty).toBe(false);
    } finally {
      tree.dispose();
    }
  });

  it("资源等待期间另一路提交确认了新修订，旧投影不能覆盖主库", async () => {
    const f = await fixture();
    const source = f.session.info.source;
    if (!source) throw new Error("正文缺少主库来源");
    const observedRevision = source.projectionRevision;
    const acknowledged = structuredClone(f.session.projectedVersion);
    const localize = f.assets.localizeDocument.bind(f.assets);
    let committed: { revision: string; snapshot: ReturnType<typeof mainSnapshot> } | undefined;
    await f.runtime.acceptUpdates(f.session, candidateUpdate(f.session, "待投影"), () => undefined);
    vi.spyOn(f.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
      const localized = await localize(...args);
      const current = ContentDocumentTable.read(f.db, source.contentId);
      if (!current) throw new Error("主库缺少正文");
      const content = current.content.map(node =>
        node.collabId === "paragraph" ? { ...node, children: [{ text: "另一路提交" }] } : node
      );
      const saved = ContentDocumentTable.commit(
        f.db,
        source.contentId,
        { ...current, content },
        { expectedRevision: current.revision, count: 5 }
      );
      // 同一会话的待办写入会在落库后确认新的投影修订。
      source.projectionRevision = saved.revision;
      f.store.metadata(f.session.info);
      committed = { revision: saved.revision, snapshot: mainSnapshot(f.db) };
      return localized;
    });

    await expect(f.runtime.project(f.session)).rejects.toThrow("修订冲突");
    if (!committed) throw new Error("另一路正文未提交");
    expect(committed.revision).not.toBe(observedRevision);
    expect(source.projectionRevision).toBe(committed.revision);
    expect(mainSnapshot(f.db)).toEqual(committed.snapshot);
    expect(paragraphText(sqlContent(f.db))).toBe("另一路提交");
    expect(f.session.projectedVersion).toEqual(acknowledged);
    expect(f.session.projectionDirty).toBe(true);
    const restored = f.store.load(f.session.info.id);
    try {
      expect(paragraphText(readNodeDocument(restored.doc).content)).toBe("待投影甲乙");
    } finally {
      restored.doc.destroy();
    }
  });

  it("等待期间同名资料库连接被替换，迟到投影既不写旧库也不污染新库", async () => {
    const f = await fixture();
    const replacement = new Database(join(f.directory, "replacement.db"));
    cleanup.push(() => replacement.open && replacement.close());
    replacement.exec(schema);
    replacement.exec(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(7,99,99,'[]',0,1)"
    );
    const oldBefore = mainSnapshot(f.db),
      newBefore = mainSnapshot(replacement);
    const tree = new NodeTree(f.session.doc);
    const localize = f.assets.localizeDocument.bind(f.assets);
    try {
      tree.insertText("paragraph", 0, "原库输入", {});
      vi.spyOn(f.assets, "localizeDocument").mockImplementationOnce(async (...args) => {
        const value = await localize(...args);
        host.databases.set("library", replacement);
        return value;
      });
      await f.runtime.project(f.session);
      expect(mainSnapshot(f.db)).toEqual(oldBefore);
      expect(mainSnapshot(replacement)).toEqual(newBefore);
      expect(f.session.projectionDirty).toBe(true);
      host.databases.set("library", f.db);
      await f.runtime.project(f.session);
      expect(paragraphText(sqlContent(f.db))).toBe("原库输入甲乙");
      expect(mainSnapshot(replacement)).toEqual(newBefore);
    } finally {
      tree.dispose();
    }
  });
});
