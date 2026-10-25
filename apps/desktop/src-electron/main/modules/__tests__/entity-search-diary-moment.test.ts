import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/content-execution", () => ({
  contentExecutor: {
    execute: async (
      request: import("../../../../shared/content-execution").ContentExecutionRequest
    ) => {
      await import("@/app/plugins/content-runtime");
      return (
        globalThis as unknown as { tauContentExecute(input: unknown): Promise<unknown> }
      ).tauContentExecute({ hash: "unit-fixtures", artifacts: [], request });
    },
  },
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../local-inference", () => ({
  default: {
    embedTexts: async (texts: string[]) => ({
      embeddings: texts.map(text => (text.includes("河边") ? [1, 0, 0] : [0, 1, 0])),
    }),
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import EntitySearchTable from "../tables/entity-search";
import FTSTable from "../tables/fts";
import VecDocumentTable from "../tables/vec-document";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";
import indexManager from "../main-content-index-db";
import { ENTITY_KIND_META } from "@/components/EntityPicker/meta";
import { CONTENT_TYPES } from "@/features/search/searchMeta";

const doc = (...lines: string[]) =>
  lines.map(text => ({ type: "paragraph", children: [{ type: "formatted", text }] })) as never;

describe("实体检索：碎碎念（diary-moment）", () => {
  let db: Database.Database;

  const day = (date: string) =>
    Number(
      db
        .prepare(
          `INSERT INTO diary_entries (create_time, update_time, type, date, content_id) VALUES (1, 1, 'daily', ?, NULL)`
        )
        .run(date).lastInsertRowid
    );
  const moment = (diaryId: number, createTime: number, ...lines: string[]) => {
    const contentId = ContentTable.createContent(db, { content: doc(...lines) });
    const id = Number(
      db
        .prepare(
          `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
        )
        .run(createTime, createTime, diaryId, contentId).lastInsertRowid
    );
    return { id, contentId };
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("按片段列出，最近更新的在前；标题取首行，元信息是日期与时间", () => {
    const d = day("2026-10-08");
    const morning = moment(d, new Date(2026, 9, 8, 8, 5).getTime(), "早上喝了咖啡", "有点困");
    const evening = moment(d, new Date(2026, 9, 8, 19, 30).getTime(), "傍晚去河边走了走");

    const result = EntitySearchTable.search(db, { kind: "diary-moment" });
    expect(result.map(item => item.id)).toEqual([evening.id, morning.id]);
    expect(result[1]).toMatchObject({
      kind: "diary-moment",
      contentId: morning.contentId,
      title: "早上喝了咖啡",
      excerpt: "有点困",
      meta: "2026-10-08 08:05",
    });
  });

  it("关键字只匹配那一条的正文，同一天的其他条不出现", () => {
    const d = day("2026-10-08");
    moment(d, 1, "早上喝了咖啡");
    const hit = moment(d, 2, "傍晚去河边走了走");
    const result = EntitySearchTable.search(db, { kind: "diary-moment", keyword: "河边" });
    expect(result.map(item => item.id)).toEqual([hit.id]);
  });

  it("经正文反查返回碎碎念身份，所属那一天只是归属信息", () => {
    const d = day("2026-10-08");
    const m = moment(d, 1, "傍晚去河边走了走");
    expect(
      EntitySearchTable.locate(db, { contentId: m.contentId, kind: "diary-moment" })
    ).toMatchObject({
      kind: "diary-moment",
      id: m.id,
      diaryId: d,
    });
  });

  it("旧日级类型即使从 IPC 传入，也不会返回搜索结果", () => {
    moment(day("2026-10-08"), 1, "河边");
    expect(EntitySearchTable.search(db, { kind: "diary" } as never)).toEqual([]);
    expect(EntitySearchTable.search(db, { kind: "diary-daily" } as never)).toEqual([]);
  });

  it("最近更新排序与混合类型的 LIMIT 一致，不遗漏后来编辑的旧碎碎念", () => {
    const d = day("2026-10-08");
    const older = moment(d, 1, "旧条目");
    moment(d, 2, "新条目");
    db.prepare("UPDATE contents SET update_time = ? WHERE id = ?").run(
      Date.now() + 1000,
      older.contentId
    );
    expect(EntitySearchTable.search(db, { kind: ["diary-moment"], limit: 1 })[0].id).toBe(older.id);
  });

  it("实体类型是片段，但选择器与全局搜索的界面标签均为日记", () => {
    expect(ENTITY_KIND_META["diary-moment"].label).toBe("日记");
    expect(CONTENT_TYPES["diary-moment"].label).toBe("日记");
  });

  it("全文回退、全文索引与向量召回均返回命中的第二条正文", async () => {
    const d = day("2026-10-08");
    const first = moment(d, 1, "早上喝了咖啡");
    const second = moment(d, 2, "傍晚去河边走了走");
    const index = new Database(":memory:");
    try {
      const query = { query: "河边", types: ["diary-moment" as const] };
      const expected = {
        id: second.id,
        contentId: second.contentId,
        type: "diary-moment",
        title: "傍晚去河边走了走",
      };
      expect(await FTSTable.searchContent(db, index, query)).toEqual([
        expect.objectContaining(expected),
      ]);
      sqliteVec.load(index);
      index.exec(indexSchema);
      VecDocumentTable.initTableByVecLength(index, 3);
      const modelInfo = {
        providerType: "local_python" as const,
        model: "fixture",
        dimensions: 3,
        distance: 0.6,
      };
      for (const [m, text] of [
        [first, "早上喝了咖啡"],
        [second, "傍晚去河边走了走"],
      ] as const) {
        const params = { id: m.id, type: "diary-moment" as const, content: text, updateTime: 2 };
        expect(await FTSTable.indexContent(index, params)).toBe(true);
        expect(await VecDocumentTable.indexContent(index, { ...params, modelInfo })).toBe(true);
      }
      expect(await FTSTable.searchContent(db, index, query)).toEqual([
        expect.objectContaining(expected),
      ]);
      expect(await VecDocumentTable.searchContent(db, index, { ...query, modelInfo })).toEqual([
        expect.objectContaining(expected),
      ]);
      expect(await FTSTable.searchHybridContent(db, index, { ...query, modelInfo })).toEqual([
        expect.objectContaining(expected),
      ]);
    } finally {
      index.close();
    }
  });

  it("开索引库清除旧日级全文与向量索引，标记重建，重复打开不再次清理新索引", () => {
    const index = new Database(":memory:");
    const manager = indexManager as unknown as {
      initSchema(db: Database.Database): void;
      resolveVecDimensionsFromSetting(): number;
    };
    const dimensions = vi.spyOn(manager, "resolveVecDimensionsFromSetting").mockReturnValue(3);
    try {
      sqliteVec.load(index);
      index.exec(indexSchema);
      VecDocumentTable.initTableByVecLength(index, 3);
      index.exec(
        "INSERT INTO content_fts (prefixed_id, type, content) VALUES ('diary-daily:5', 'diary-daily', '旧日记'), ('card:7', 'card', '卡片')"
      );
      const insert = index.prepare(
        "INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding) VALUES (?, 1.0, '', ?, 0, vec_f32(?))"
      );
      insert.run("diary-daily:5", "diary-daily", "[1,0,0]");
      insert.run("card:7", "card", "[0,1,0]");
      manager.initSchema(index);
      expect(index.prepare("SELECT type FROM content_fts").all()).toEqual([{ type: "card" }]);
      expect(index.prepare("SELECT type FROM vec_documents").all()).toEqual([{ type: "card" }]);
      expect(
        index.prepare("SELECT value FROM index_meta WHERE key = 'fts_rebuild_state'").get()
      ).toEqual({ value: "pending" });
      expect(
        index.prepare("SELECT value FROM index_meta WHERE key = 'vec_rebuild_state'").get()
      ).toEqual({ value: "pending" });
      index.exec(
        "UPDATE index_meta SET value = 'ready' WHERE key IN ('fts_rebuild_state', 'vec_rebuild_state')"
      );
      index.exec(
        "INSERT INTO content_fts (prefixed_id, type, content) VALUES ('diary-moment:12', 'diary-moment', '新日记')"
      );
      manager.initSchema(index);
      expect(
        index.prepare("SELECT value FROM index_meta WHERE key = 'fts_rebuild_state'").get()
      ).toEqual({ value: "ready" });
      expect(
        index.prepare("SELECT type FROM content_fts WHERE type = 'diary-moment'").all()
      ).toHaveLength(1);
    } finally {
      dimensions.mockRestore();
      index.close();
    }
  });
});
