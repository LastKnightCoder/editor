// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { validateContentContractsSync } from "@tau/db-schema/content-contracts-node";
import { ContentIdentityTable } from "../content-identity";
import { ContentDocumentTable, type ContentDocumentWrite } from "../content-document";
import ContentTable from "../content";
import { createNodeDocument } from "@tau/collaboration";
import {
  registerContentSession,
  unregisterContentSession,
} from "../../collaboration/content-sessions";
import type { RuntimeSession } from "../../collaboration/types";

const execution = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../../services/content-execution", () => ({ contentExecutor: execution }));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

const databases: Database.Database[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  databases.splice(0).forEach(db => db.close());
});
function database() {
  const db = new Database(":memory:");
  db.exec(schema);
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (1,1,1,'[]',0,1)"
  ).run();
  db.prepare(
    "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES (7,1,1,'{}',0)"
  ).run();
  databases.push(db);
  return db;
}
async function payload(db: Database.Database): Promise<ContentDocumentWrite> {
  ContentIdentityTable.establishBaseline(db);
  const ref = ContentIdentityTable.bind(db, "whiteboard-content", 7, 1);
  const { id, contract } = await prepareContentContract("host.whiteboard", {
    type: "whiteboard",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
  });
  return {
    documentId: "document",
    contracts: { [id]: contract },
    content: [
      {
        type: "whiteboard",
        collabId: "node",
        tauContract: id,
        entityRef: ref,
        custom: { preserve: true },
        children: [{ text: "" }],
      },
    ],
  };
}
const relations = (db: Database.Database) =>
  vi.fn(
    (
      removed: readonly import("@tau/db-schema/content-identities").ContentEntityRelation[],
      added: readonly import("@tau/db-schema/content-identities").ContentEntityRelation[]
    ) => {
      for (const [items, delta] of [
        [removed, -1],
        [added, 1],
      ] as const)
        for (const item of items) {
          const local = ContentIdentityTable.resolve(db, item.target);
          if (local !== null)
            db.prepare("UPDATE white_board_contents SET ref_count=ref_count+? WHERE id=?").run(
              delta,
              local
            );
        }
    }
  );
const count = (db: Database.Database) =>
  (
    db.prepare("SELECT ref_count FROM white_board_contents WHERE id=7").get() as {
      ref_count: number;
    }
  ).ref_count;

describe("正文身份、契约与关系账的持久化", () => {
  it("一次读取正文及契约，原始正文不在主进程解析或重编码，并保留取消信号", async () => {
    const db = database();
    const old = await prepareContentContract("example.source", {
      type: "example.source",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["source"] },
    });
    const contracts = { [old.id]: old.contract };
    const id = ContentTable.createContent(db, {
      content: [
        { type: "example.source", tauContract: old.id, source: "旧源码", children: [{ text: "" }] },
      ] as never,
      contracts,
    });
    const raw = `\n  ${(db.prepare("SELECT content FROM contents WHERE id=?").get(id) as { content: string }).content}\n`;
    db.prepare("UPDATE contents SET content=? WHERE id=?").run(raw, id);
    const queries = vi.spyOn(db, "prepare");
    const parse = vi.spyOn(JSON, "parse");
    const readDocument = vi.spyOn(ContentDocumentTable, "read");
    execution.execute.mockReset();
    execution.execute.mockResolvedValue({ content: "旧源码" });
    const controller = new AbortController();
    expect(await ContentTable.readText(db, id, "标题", false, false, controller.signal)).toEqual({
      content: "旧源码",
    });
    expect(queries).toHaveBeenCalledTimes(1);
    expect(readDocument).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalledWith(raw);
    expect(execution.execute).toHaveBeenCalledWith(
      {
        operation: "index",
        contracts,
        input: { raw, title: "标题", whole: false, sections: false },
      },
      controller.signal
    );
    expect(await ContentTable.readText(db, 999, "标题")).toEqual({ content: "", sections: [] });
    controller.abort();
    queries.mockClear();
    await expect(ContentTable.readText(db, id, "", false, true, controller.signal)).rejects.toThrow(
      "结束"
    );
    expect(queries).not.toHaveBeenCalled();
    expect(execution.execute).toHaveBeenCalledTimes(1);
  }, 20000);

  it("活跃会话沿用会话正文和契约，身份校验不再读取整篇数据库正文", async () => {
    const db = database();
    const saved = await payload(db);
    ContentDocumentTable.commit(db, 1, saved, { installDocument: true, count: 0 });
    const paragraph = await prepareContentContract("tau.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const contracts = { [paragraph.id]: paragraph.contract };
    const content = [
      {
        type: "paragraph",
        collabId: "live-node",
        tauContract: paragraph.id,
        children: [{ text: "会话中的新正文" }],
      },
    ];
    const doc = await createNodeDocument(
      { documentId: saved.documentId, baselineId: "baseline", epoch: 0 },
      { title: "", bannerBg: "", bannerPosition: "center", content },
      contracts
    );
    const session = {
      doc,
      info: {
        mode: "local",
        source: {
          contentId: 1,
          contentCreatedAt: 1,
          librarySourceId: ContentIdentityTable.library(db)!.sourceId,
          contentDocumentId: saved.documentId,
        },
      },
    } as RuntimeSession;
    registerContentSession(db, 1, session);
    execution.execute.mockReset();
    execution.execute.mockResolvedValue({ content: "会话中的新正文" });
    const readDocument = vi.spyOn(ContentDocumentTable, "read");
    const queries = vi.spyOn(db, "prepare");
    try {
      expect(await ContentTable.readText(db, 1)).toMatchObject({ content: "会话中的新正文" });
      expect(execution.execute).toHaveBeenCalledWith(
        expect.objectContaining({ contracts }),
        undefined
      );
      expect(JSON.parse(execution.execute.mock.calls[0][0].input.raw)).toMatchObject(content);
      expect(readDocument).not.toHaveBeenCalled();
      expect(queries.mock.calls.filter(([sql]) => sql.includes("c.content"))).toHaveLength(1);
      session.info.source!.contentDocumentId = "另一份正文";
      await ContentTable.readText(db, 1);
      expect(execution.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({ contracts: saved.contracts }),
        undefined
      );
    } finally {
      unregisterContentSession(session);
      doc.destroy();
    }
  });

  it("无契约正文仍原样送往转换进程，转换期间取消不会返回结果", async () => {
    const db = database();
    const raw = '\n [{"type":"paragraph","children":[{"text":"原始正文"}]}] ';
    db.prepare("UPDATE contents SET content=? WHERE id=1").run(raw);
    execution.execute.mockReset();
    let started!: () => void;
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    execution.execute.mockImplementation(
      (_request, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("内容转换已取消")), {
            once: true,
          });
          started();
        })
    );
    const controller = new AbortController();
    const request = ContentTable.readText(db, 1, "", false, false, controller.signal);
    const rejected = expect(request).rejects.toThrow("取消");
    await entered;
    expect(execution.execute).toHaveBeenCalledWith(
      {
        operation: "index",
        contracts: undefined,
        input: { raw, title: "", whole: false, sections: false },
      },
      controller.signal
    );
    controller.abort();
    await rejected;
  });

  it("生产创建入口复制契约正文，生成新身份且只增加一次实体引用", async () => {
    const db = database(),
      original = await payload(db);
    const first = ContentTable.createContent(db, {
      content: original.content as never,
      contracts: original.contracts,
    });
    const read = ContentTable.getContentById(db, first)!;
    const copied = ContentTable.createContent(db, read);
    const copy = ContentTable.getContentById(db, copied)!;
    expect(read.contracts).toEqual(original.contracts);
    expect(copy.contracts).toEqual(original.contracts);
    expect((copy.content[0] as any).collabId).not.toBe((read.content[0] as any).collabId);
    expect(ContentDocumentTable.read(db, copied)!.documentId).not.toBe(
      ContentDocumentTable.read(db, first)!.documentId
    );
    expect(count(db)).toBe(2);
    expect(ContentTable.getContentByIds(db, [first, copied]).every(value => value.contracts)).toBe(
      true
    );
    const size = db.prepare("SELECT count(*) AS n FROM contents").get();
    expect(() =>
      ContentTable.createContent(db, { content: original.content as never, contracts: {} })
    ).toThrow("契约");
    expect(db.prepare("SELECT count(*) AS n FROM contents").get()).toEqual(size);
    expect(count(db)).toBe(2);
  });
  it("真实表计数按净关系提交，多个块只持有一份单元格正文，归零与撤销不重复释放", async () => {
    const db = database();
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (2,1,1,'[]',0,0)"
    ).run();
    db.prepare(
      "INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES (42,1,1,?,?,0)"
    ).run(
      JSON.stringify([{ id: "rich", type: "rich-text", title: "正文" }]),
      JSON.stringify([{ id: "row", rich: [{ contentId: 2 }] }])
    );
    ContentIdentityTable.establishBaseline(db);
    const ref = ContentIdentityTable.bind(db, "data-table", 42, 1);
    const contract = await prepareContentContract("host.database", {
      type: "database",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    const value: ContentDocumentWrite = {
      documentId: "document",
      contracts: { [contract.id]: contract.contract },
      content: ["a", "b", "c"].map(collabId => ({
        type: "database",
        collabId,
        entityRef: ref,
        tauContract: contract.id,
        children: [{ text: "" }],
      })),
    };
    const tableCount = () =>
      (db.prepare("SELECT ref_count FROM data_tables WHERE id=42").get() as { ref_count: number })
        .ref_count;
    const bodyCount = () =>
      (db.prepare("SELECT ref_count FROM contents WHERE id=2").get() as { ref_count: number })
        .ref_count;
    let saved = ContentDocumentTable.commit(db, 1, value, { count: 0, installDocument: true });
    expect(tableCount()).toBe(3);
    expect(bodyCount()).toBe(1);
    saved = ContentDocumentTable.commit(
      db,
      1,
      {
        ...value,
        content: value.content.map(node => ({ ...node, collabId: `${node.collabId}-moved` })),
      },
      { count: 0, expectedRevision: saved.revision }
    );
    expect(tableCount()).toBe(3);
    expect(bodyCount()).toBe(1);
    expect(db.prepare("SELECT * FROM data_table_pending_releases").all()).toEqual([]);
    saved = ContentDocumentTable.commit(
      db,
      1,
      { ...value, content: [value.content[0]] },
      { count: 0, expectedRevision: saved.revision }
    );
    expect(tableCount()).toBe(1);
    expect(bodyCount()).toBe(1);
    saved = ContentDocumentTable.commit(
      db,
      1,
      { ...value, content: [] },
      { count: 0, expectedRevision: saved.revision }
    );
    expect(tableCount()).toBe(0);
    expect(bodyCount()).toBe(0);
    saved = ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      expectedRevision: saved.revision,
    });
    expect(tableCount()).toBe(3);
    expect(bodyCount()).toBe(1);
    db.prepare("UPDATE data_tables SET ref_count=0 WHERE id=42").run();
    expect(() =>
      ContentDocumentTable.commit(
        db,
        1,
        { ...value, content: [] },
        { count: 0, expectedRevision: saved.revision }
      )
    ).toThrow("引用数不一致");
    expect(ContentDocumentTable.read(db, 1)).toEqual(saved);
    expect(bodyCount()).toBe(1);
  });

  it("独立旧库相同数字 ID 不被认同源，正常库快照保持身份", async () => {
    const first = database(),
      second = database();
    const value = await payload(first);
    await payload(second);
    const reference = value.content[0]
      .entityRef as import("@tau/db-schema/content-identities").ContentEntityReference;
    expect(ContentIdentityTable.resolve(first, reference)).toBe(7);
    expect(ContentIdentityTable.resolve(second, reference)).toBeNull();
    const restored = new Database(first.serialize());
    databases.push(restored);
    expect(ContentIdentityTable.resolve(restored, reference)).toBe(7);
  });

  it("退役后即使主键与创建时间相同，新实体也不继承原引用", () => {
    const db = database();
    ContentIdentityTable.establishBaseline(db);
    const old = ContentIdentityTable.bind(db, "whiteboard-content", 7, 1);
    ContentIdentityTable.retire(db, "whiteboard-content", 7);
    const current = ContentIdentityTable.bind(db, "whiteboard-content", 7, 1);
    expect(current.entityId).not.toBe(old.entityId);
    expect(ContentIdentityTable.resolve(db, old)).toBeNull();
    expect(ContentIdentityTable.resolve(db, current)).toBe(7);
  });

  it("正文、契约、关系与计数同事务；失败不留下半次保存", async () => {
    const db = database(),
      value = await payload(db),
      apply = relations(db);
    expect(validateContentContractsSync(value.contracts)).toEqual(value.contracts);
    expect(() =>
      ContentDocumentTable.commit(db, 1, value, {
        count: 0,
        installDocument: true,
        applyRelations: (removed, added) => {
          apply(removed, added);
          throw new Error("模拟故障");
        },
      })
    ).toThrow("模拟故障");
    expect(ContentDocumentTable.read(db, 1)).toBeNull();
    expect(db.prepare("SELECT * FROM content_entity_relations").all()).toEqual([]);
    expect(count(db)).toBe(0);
    const saved = ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      installDocument: true,
      applyRelations: apply,
    });
    expect(ContentDocumentTable.read(db, 1)).toEqual(saved);
    expect(saved.content[0].custom).toEqual({ preserve: true });
    expect(count(db)).toBe(1);
  });

  it("多次投影只记一次，删除和撤销按关系差集释放与恢复", async () => {
    const db = database(),
      value = await payload(db),
      apply = relations(db);
    const initial = ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      installDocument: true,
      applyRelations: apply,
    });
    ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      expectedRevision: initial.revision,
      applyRelations: apply,
    });
    expect(count(db)).toBe(1);
    const removed = ContentDocumentTable.commit(
      db,
      1,
      { ...value, content: [] },
      { count: 0, expectedRevision: initial.revision, applyRelations: apply }
    );
    expect(count(db)).toBe(0);
    ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      expectedRevision: removed.revision,
      applyRelations: apply,
    });
    expect(count(db)).toBe(1);
  });

  it("复制正文增加独立关系，共用正文不重复记账", async () => {
    const db = database(),
      value = await payload(db),
      apply = relations(db);
    const initial = ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      installDocument: true,
      applyRelations: apply,
    });
    ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      expectedRevision: initial.revision,
      applyRelations: apply,
    });
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (2,1,1,'[]',0,1)"
    ).run();
    ContentDocumentTable.commit(
      db,
      2,
      {
        ...value,
        documentId: "copy",
        content: value.content.map(node => ({ ...node, collabId: "copied-node" })),
      },
      { count: 0, installDocument: true, applyRelations: apply }
    );
    expect(count(db)).toBe(2);
    expect(db.prepare("SELECT count(*) AS count FROM content_entity_relations").get()).toEqual({
      count: 2,
    });
  });

  it("外部来源保留关系意图，不动当前库同号实体", async () => {
    const db = database(),
      value = await payload(db),
      apply = relations(db);
    value.content[0].entityRef = {
      ...(value.content[0].entityRef as object),
      sourceId: "other-source",
    };
    ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      installDocument: true,
      applyRelations: apply,
    });
    expect(count(db)).toBe(0);
    expect(db.prepare("SELECT source_id FROM content_entity_relations").get()).toEqual({
      source_id: "other-source",
    });
  });

  it("默认关系服务原子记账，过期修订和契约缺失拒绝写入", async () => {
    const db = database(),
      value = await payload(db),
      apply = relations(db);
    const saved = ContentDocumentTable.commit(db, 1, value, {
      count: 0,
      installDocument: true,
    });
    expect(count(db)).toBe(1);
    expect(() =>
      ContentDocumentTable.commit(db, 1, value, {
        count: 0,
        expectedRevision: "stale",
        applyRelations: apply,
      })
    ).toThrow("修订冲突");
    expect(() =>
      ContentDocumentTable.commit(
        db,
        1,
        { ...value, contracts: {} },
        { count: 0, expectedRevision: saved.revision, applyRelations: apply }
      )
    ).toThrow("契约缺失");
    expect(ContentDocumentTable.read(db, 1)).toEqual(saved);
  });
});
