// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { getContentLength } from "@/utils/helper";
import { ContentDocumentTable } from "../content-document";
import { ContentDocumentBlocks, type ContentBlockWrite } from "../content-document-blocks";
import { ContentIdentityTable } from "../content-identity";
import type { ContentNode } from "@tau/collaboration";

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
  for (const db of databases.splice(0)) db.close();
});

async function fixture() {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec(schema);
  db.exec(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (1,1,1,'[]',0,1)"
  );
  ContentIdentityTable.establishBaseline(db);
  const definition = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const content: ContentNode[] = ["甲", "乙"].map((text, index) => ({
    type: "paragraph",
    collabId: `block-${index}`,
    tauContract: definition.id,
    children: [{ type: "formatted", text }],
  }));
  const saved = ContentDocumentTable.commit(
    db,
    1,
    { documentId: "document", contracts: { [definition.id]: definition.contract }, content },
    { installDocument: true, count: 2 }
  );
  const count: ContentBlockWrite["count"] = nodes => getContentLength(nodes as never);
  const write = (blocks: ContentNode[], options: Partial<ContentBlockWrite> = {}) =>
    ContentDocumentBlocks.commit(db, 1, {
      documentId: saved.documentId,
      expectedRevision: ContentDocumentTable.read(db, 1)!.revision,
      contracts: saved.contracts,
      blocks,
      count,
      countRules: "rules-1",
      ...options,
    });
  return { db, saved, content, count, write };
}

it("拆块保留正文，修改一个块只写一行正文载荷且不读取完整快照", async () => {
  const { db, saved, content, write } = await fixture();
  write(content, { order: ["block-0", "block-1"] });
  expect(db.prepare("SELECT content FROM contents WHERE id=1").get()).toEqual({ content: null });
  expect(ContentDocumentTable.read(db, 1)).toEqual(saved);
  db.exec(
    "CREATE TEMP TABLE block_writes(id TEXT); CREATE TEMP TRIGGER block_written AFTER UPDATE OF content ON content_document_blocks BEGIN INSERT INTO block_writes VALUES (NEW.block_id); END;"
  );
  const read = vi.spyOn(ContentDocumentTable, "read");
  const modified = { ...content[1], children: [{ type: "formatted", text: "乙修改" }] };
  const result = ContentDocumentBlocks.commit(db, 1, {
    documentId: saved.documentId,
    expectedRevision: saved.revision,
    contracts: saved.contracts,
    blocks: [modified],
    count: nodes => getContentLength(nodes as never),
    countRules: "rules-1",
  });
  expect(read).not.toHaveBeenCalled();
  expect(result).toMatchObject({ changed: true, writtenBlocks: 1 });
  expect(db.prepare("SELECT id FROM block_writes").all()).toEqual([{ id: "block-1" }]);
  expect(ContentDocumentTable.read(db, 1)!.content).toEqual([content[0], modified]);
  expect(db.prepare("SELECT count FROM contents WHERE id=1").get()).toEqual({ count: 4 });
});

it("块写入、规则重计数与修订随外层事务一起回滚", async () => {
  const { db, saved, content, write } = await fixture();
  expect(() =>
    db.transaction(() => {
      write([{ ...content[1], children: [{ type: "formatted", text: "不能落库" }] }]);
      throw new Error("中途失败");
    })()
  ).toThrow("中途失败");
  expect(ContentDocumentTable.read(db, 1)).toEqual(saved);
  expect(db.prepare("SELECT * FROM content_document_blocks").all()).toHaveLength(0);
  expect(db.prepare("SELECT * FROM content_document_block_counts").all()).toHaveLength(0);
  write(content, { order: ["block-0", "block-1"] });
  db.prepare("UPDATE contents SET update_time=100 WHERE id=1").run();
  write(content, { order: ["block-0", "block-1"], countRules: "rules-2", count: () => 2 });
  expect(db.prepare("SELECT count,update_time FROM contents WHERE id=1").get()).toEqual({
    count: 4,
    update_time: 100,
  });
});

it("整篇替换清除旧分块，下一次局部编辑能重新拆块", async () => {
  const { db, saved, content, write } = await fixture();
  write(content, { order: ["block-0", "block-1"] });
  const replacement = {
    ...saved,
    content: [{ ...content[0], children: [{ type: "formatted", text: "外部替换" }] }],
  };
  const updated = ContentDocumentTable.commit(db, 1, replacement, {
    expectedRevision: ContentDocumentTable.read(db, 1)!.revision,
    count: 4,
  });
  expect(db.prepare("SELECT * FROM content_document_blocks").all()).toHaveLength(0);
  expect(db.prepare("SELECT * FROM content_document_node_blocks").all()).toHaveLength(0);
  expect(db.prepare("SELECT * FROM content_document_block_counts").all()).toHaveLength(0);
  expect(ContentDocumentTable.read(db, 1)).toEqual(updated);
  const modified = {
    ...replacement.content[0],
    children: [{ type: "formatted", text: "再次编辑" }],
  };
  write([modified]);
  expect(ContentDocumentTable.read(db, 1)!.content).toEqual([modified]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);
});

it("块内节点不得抢占未修改块的身份，失败保持正文与索引不变", async () => {
  const { db, saved, content, write } = await fixture();
  write(content, { order: ["block-0", "block-1"] });
  expect(() => write([{ ...content[0], children: [content[1]] }])).toThrow();
  expect(ContentDocumentTable.read(db, 1)).toEqual(saved);
  expect(
    db.prepare("SELECT node_id,block_id FROM content_document_node_blocks ORDER BY node_id").all()
  ).toEqual([
    { node_id: "block-0", block_id: "block-0" },
    { node_id: "block-1", block_id: "block-1" },
  ]);
});

it("单块编辑仍维护整篇结构预算，不能逐块累计绕过全局限制", async () => {
  const { db, saved, content, write } = await fixture();
  const large = content.map(node => ({ ...node, extra: Array.from({ length: 249980 }, () => 0) }));
  const full = ContentDocumentTable.commit(
    db,
    1,
    { ...saved, content: large },
    { expectedRevision: saved.revision, count: 2 }
  );
  write(large, { order: ["block-0", "block-1"] });
  expect(() => write([{ ...large[0], extra: Array.from({ length: 250010 }, () => 0) }])).toThrow(
    "正文数据超过预算"
  );
  const current = ContentDocumentTable.read(db, 1)!;
  expect(current.revision).toBe(full.revision);
  expect((current.content[0].extra as unknown[]).length).toBe(249980);
  expect(ContentDocumentTable.problem(current.content, current.contracts)).toBeNull();
});
