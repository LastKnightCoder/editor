import Database from "better-sqlite3";
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
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import PluginEntityTable from "../tables/plugin-entity";
import PluginDataTable from "../tables/plugin-data";
import EntitySearchTable from "../tables/entity-search";
import ContentTable from "../tables/content";
import { searchResultDetails } from "../search-details";
import { listContentIndexCandidates } from "../index-candidates";

const scope = { databaseName: ":memory:", pluginId: "tau.weekly-review" };
const DAY = 24 * 60 * 60 * 1000;
const NEWEST = [{ builtin: "createdAt", direction: "desc" as const }];

describe("PluginEntityTable", () => {
  let db: Database.Database;
  const note = (key: string) =>
    PluginEntityTable.create(db, {
      ...scope,
      input: { kind: "note", key, title: `周记 ${key}`, meta: { week: key } },
    });
  const refCount = (contentId: number) =>
    (
      db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(contentId) as
        | { ref_count: number }
        | undefined
    )?.ref_count;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("新建持有一份空白正文，同一类型下 key 唯一，只读得到自己的内容", async () => {
    const created = await note("2026-W43");
    expect(created).toMatchObject({
      pluginId: "tau.weekly-review",
      kind: "note",
      key: "2026-W43",
      title: "周记 2026-W43",
      meta: { week: "2026-W43" },
    });
    expect(refCount(created.contentId)).toBe(1);
    await expect(note("2026-W43")).rejects.toThrow("PLUGIN_CONFLICT:");
    expect(PluginEntityTable.find(db, { ...scope, kind: "note", key: "2026-W43" })?.id).toBe(
      created.id
    );
    expect(PluginEntityTable.get(db, { ...scope, pluginId: "other", id: created.id })).toBeNull();
    // 正文读取能识别自有内容的归属
    const content = PluginDataTable.content(db, {
      databaseName: ":memory:",
      contentId: created.contentId,
      createdAt: created.contentCreatedAt,
      format: "nodes",
    });
    return Promise.resolve(content).then(record =>
      expect(record?.pluginOwners).toEqual([
        { pluginId: "tau.weekly-review", id: created.id, title: "周记 2026-W43" },
      ])
    );
  });

  it("新建可带初始正文，自有实体的正文可作为 copyOf 来源", async () => {
    const created = await PluginEntityTable.create(db, {
      ...scope,
      input: {
        kind: "note",
        key: "2026-W44",
        title: "",
        meta: {},
        content: { markdown: "# 本周" },
      },
    });
    const raw = (contentId: number) =>
      (
        db.prepare("SELECT content FROM contents WHERE id = ?").get(contentId) as {
          content: string;
        }
      ).content;
    expect(raw(created.contentId)).toContain("本周");
    const copy = await PluginEntityTable.create(db, {
      ...scope,
      input: {
        kind: "note",
        key: "2026-W45",
        title: "",
        meta: {},
        content: { copyOf: { contentId: created.contentId, createdAt: created.contentCreatedAt } },
      },
    });
    expect(copy.contentId).not.toBe(created.contentId);
    const originalNodes = JSON.parse(raw(created.contentId));
    const copiedNodes = JSON.parse(raw(copy.contentId));
    expect(copiedNodes[0].collabId).not.toBe(originalNodes[0].collabId);
    expect(copiedNodes).toEqual(
      originalNodes.map((node: object) => ({ ...node, collabId: copiedNodes[0].collabId }))
    );
    expect(refCount(copy.contentId)).toBe(1);
  });

  it("共用正文：卡片、文章、项目文档引用插件内容的同一份正文，删除插件内容不影响它们", async () => {
    const ctx = { broadcastOthers: vi.fn(), broadcastAll: vi.fn() };
    const answer = await PluginEntityTable.create(db, {
      ...scope,
      input: {
        kind: "answer",
        key: "a1",
        title: "结论",
        meta: {},
        content: { markdown: "扇出大" },
      },
    });
    const shareOf = { contentId: answer.contentId, createdAt: answer.contentCreatedAt };
    const create = (entity: "card" | "article", extra: Record<string, unknown> = {}) =>
      PluginDataTable.create(
        db,
        { ...scope, entity, input: { content: { shareOf }, ...extra } },
        ctx
      );
    const card = await create("card", { tags: ["答案"], pinned: true });
    expect(card).toMatchObject({ contentId: answer.contentId, tags: ["答案"], pinned: true });
    await expect(create("card")).rejects.toThrow("这份正文已经是卡片");
    const article = await create("article", { title: "B+ 树", tags: ["数据库"] });
    expect(article).toMatchObject({
      contentId: answer.contentId,
      title: "B+ 树",
      tags: ["数据库"],
    });
    await expect(create("article", { title: "再来" })).rejects.toThrow("这份正文已经是文章");
    const project = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    const doc = await PluginDataTable.createDocument(db, {
      ...scope,
      input: { projectId: project.id, title: "答案", content: { shareOf } },
    });
    expect(doc.contentId).toBe(answer.contentId);
    expect(refCount(answer.contentId)).toBe(4);
    expect(PluginDataTable.sharedContent(db, { ...scope, source: shareOf })).toBe(answer.contentId);

    // 只能共用本插件、仍然存在的内容
    await expect(
      PluginDataTable.create(
        db,
        {
          ...scope,
          pluginId: "other",
          entity: "article",
          input: { title: "x", content: { shareOf } },
        },
        ctx
      )
    ).rejects.toThrow("只能共用本插件内容的正文");
    const stale = { contentId: answer.contentId, createdAt: answer.contentCreatedAt + 1 };
    expect(() => PluginDataTable.sharedContent(db, { ...scope, source: stale })).toThrow(
      "只能共用本插件内容的正文"
    );
    await expect(
      PluginEntityTable.create(db, {
        ...scope,
        input: { kind: "answer", key: "a2", title: "", meta: {}, content: { shareOf } },
      })
    ).rejects.toThrow("shareOf 只能用于");

    PluginEntityTable.remove(db, { ...scope, id: answer.id, expectedRevision: answer.revision });
    expect(refCount(answer.contentId)).toBe(3);
    expect(PluginDataTable.get(db, { ...scope, entity: "card", id: card.id })?.contentId).toBe(
      answer.contentId
    );
  });

  it("按创建时间倒序分页，修改校验 revision", async () => {
    const first = await note("a");
    await note("b");
    await note("c");
    const page = PluginEntityTable.query(db, {
      ...scope,
      query: { kind: "note", orderBy: NEWEST, limit: 2 },
    });
    expect(page.items).toHaveLength(2);
    const rest = PluginEntityTable.query(db, {
      ...scope,
      query: { kind: "note", orderBy: NEWEST, limit: 2, cursor: page.cursor },
    });
    expect([...page.items, ...rest.items].map(item => item.key).sort()).toEqual(["a", "b", "c"]);
    expect(rest.cursor).toBeUndefined();

    const updated = PluginEntityTable.update(db, {
      ...scope,
      id: first.id,
      patch: { title: "改名" },
      expectedRevision: first.revision,
    });
    expect(updated).toMatchObject({ title: "改名", meta: { week: "a" } });
    expect(updated.revision).not.toBe(first.revision);
    expect(() =>
      PluginEntityTable.update(db, {
        ...scope,
        id: first.id,
        patch: { title: "再改" },
        expectedRevision: first.revision,
      })
    ).toThrow("PLUGIN_CONFLICT:");
  });

  it("按索引字段筛选、排序与计数；分页跨过没有值的项，游标绑定查询", async () => {
    const indexes = { status: "string", rank: "number", pinned: "boolean" } as const;
    const question = (key: string, meta: Record<string, unknown>, title = key) =>
      PluginEntityTable.create(db, {
        ...scope,
        input: { kind: "question", key, title, meta, indexes },
      });
    await question("a", { status: "open", rank: 2 });
    await question("b", { status: "resolved", rank: 1, pinned: true });
    await question("c", { status: "open" }, "100%_完成");
    await question("d", { rank: 2 });
    // 类型与声明不符的值按没有值处理
    db.prepare("UPDATE plugin_entities SET meta = ? WHERE key = 'd'").run(
      JSON.stringify({ rank: 2, status: 7 })
    );
    await question("e", { status: "open", rank: 3 });
    await expect(question("f", { rank: "1" })).rejects.toThrow("number");

    const keys = (query: Parameters<typeof PluginEntityTable.query>[1]["query"]) => {
      const all: string[] = [];
      let cursor: string | undefined;
      do {
        const page = PluginEntityTable.query(db, {
          ...scope,
          query: { ...query, ...(cursor ? { cursor } : {}) },
        });
        all.push(...page.items.map(item => item.key));
        cursor = page.cursor;
      } while (cursor);
      return all;
    };
    const rankAsc = [{ field: "rank", type: "number" as const, direction: "asc" as const }];
    // 升序时没有值的排在最前，同值按 ID 兜底；每页一条也不重不漏
    expect(keys({ kind: "question", orderBy: rankAsc, limit: 1 })).toEqual([
      "c",
      "b",
      "a",
      "d",
      "e",
    ]);
    expect(
      keys({
        kind: "question",
        orderBy: [{ field: "rank", type: "number", direction: "desc" }],
        limit: 2,
      })
    ).toEqual(["e", "d", "a", "b", "c"]);
    expect(
      keys({
        kind: "question",
        where: [
          { field: "status", type: "string", op: "ne", value: "resolved" },
          { field: "rank", type: "number", op: "gte", value: 2 },
        ],
        orderBy: rankAsc,
        limit: 10,
      })
    ).toEqual(["a", "d", "e"]);
    expect(
      keys({
        kind: "question",
        where: [{ field: "status", type: "string", op: "in", value: ["resolved", null] }],
        orderBy: NEWEST,
        limit: 10,
      })
    ).toEqual(["d", "b"]);
    expect(
      keys({
        kind: "question",
        where: [{ field: "pinned", type: "boolean", op: "eq", value: true }],
        orderBy: NEWEST,
        limit: 10,
      })
    ).toEqual(["b"]);
    // 标题包含时通配符按原文匹配
    expect(keys({ kind: "question", titleContains: "%_", orderBy: NEWEST, limit: 10 })).toEqual([
      "c",
    ]);
    expect(
      PluginEntityTable.count(db, {
        ...scope,
        filter: {
          kind: "question",
          where: [{ field: "status", type: "string", op: "eq", value: "open" }],
        },
      })
    ).toBe(3);

    const first = PluginEntityTable.query(db, {
      ...scope,
      query: { kind: "question", orderBy: rankAsc, limit: 2 },
    });
    expect(() =>
      PluginEntityTable.query(db, {
        ...scope,
        query: { kind: "question", orderBy: NEWEST, limit: 2, cursor: first.cursor },
      })
    ).toThrow("游标");

    const target = PluginEntityTable.find(db, { ...scope, kind: "question", key: "a" })!;
    expect(() =>
      PluginEntityTable.update(db, {
        ...scope,
        id: target.id,
        patch: { meta: { status: 1 } },
        expectedRevision: target.revision,
        indexes: { question: indexes },
      })
    ).toThrow("string");
  });

  it("插件目录不在时记孤儿，宽限期内重新出现即撤销，超期删除并延迟释放正文", async () => {
    const created = await note("2026-W43");
    const now = Date.now();
    const collect = (installed: Set<string> | null, at: number) =>
      PluginEntityTable.collectOrphans(db, { installed, now: at, graceMs: 7 * DAY });
    const orphaned = () =>
      (db.prepare("SELECT orphaned_time FROM plugin_entities").get() as { orphaned_time: number })
        .orphaned_time;

    expect(collect(null, now)).toBe(0);
    expect(orphaned()).toBeNull();
    expect(collect(new Set(), now)).toBe(0);
    expect(orphaned()).toBe(now);
    expect(collect(new Set(["tau.weekly-review"]), now + DAY)).toBe(0);
    expect(orphaned()).toBeNull();

    collect(new Set(), now);
    // 插件再次读写自己的内容同样撤销孤儿标记
    PluginEntityTable.get(db, { ...scope, id: created.id });
    expect(orphaned()).toBeNull();

    collect(new Set(), now);
    expect(collect(new Set(), now + 8 * DAY)).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM plugin_entities").get()).toEqual({ n: 0 });
    expect(refCount(created.contentId)).toBe(0);
    expect(db.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([
      { content_id: created.contentId },
    ]);
  });

  it("删除可在 7 天内恢复：ID、key 与正文不变，编号不被新内容占用", async () => {
    const created = await note("2026-W43");
    expect(() =>
      PluginEntityTable.remove(db, { ...scope, id: created.id, expectedRevision: "0" })
    ).toThrow("PLUGIN_CONFLICT:");
    expect(() =>
      PluginEntityTable.remove(db, {
        ...scope,
        pluginId: "other",
        id: created.id,
        expectedRevision: created.revision,
      })
    ).toThrow("内容不存在");
    PluginEntityTable.remove(db, { ...scope, id: created.id, expectedRevision: created.revision });
    expect(PluginEntityTable.byId(db, created.id)).toBeNull();
    expect(refCount(created.contentId)).toBe(0);

    // 新建不复用已删除的编号
    const next = await note("2026-W44");
    expect(next.id).toBeGreaterThan(created.id);

    const [operation] = PluginDataTable.operations(db, scope);
    expect(operation).toMatchObject({
      entity: "plugin-entity",
      entityId: String(created.id),
      title: "周记 2026-W43",
      kind: "note",
    });
    expect(PluginDataTable.restore(db, { databaseName: ":memory:", id: operation.id })).toEqual({
      entity: "plugin-entity",
      id: created.id,
    });
    expect(PluginEntityTable.byId(db, created.id)).toMatchObject({
      key: "2026-W43",
      contentId: created.contentId,
      meta: { week: "2026-W43" },
    });
    expect(refCount(created.contentId)).toBe(1);
    expect(() =>
      PluginDataTable.restore(db, { databaseName: ":memory:", id: operation.id })
    ).toThrow("已经恢复过了");
  });

  it("插件重新创建了同一项内容时拒绝恢复", async () => {
    const created = await note("2026-W43");
    PluginEntityTable.remove(db, { ...scope, id: created.id, expectedRevision: created.revision });
    await note("2026-W43");
    const [operation] = PluginDataTable.operations(db, scope);
    expect(() =>
      PluginDataTable.restore(db, { databaseName: ":memory:", id: operation.id })
    ).toThrow("重新创建");
  });

  it("类型外观随库保存，未变化不写入；插件卸载且内容清空后删除", async () => {
    const declare = (label: string, icon = "") =>
      PluginEntityTable.declareKind(db, { ...scope, kind: "note", label, icon });
    const icon = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24"/></svg>';
    expect(declare("周记", icon)).toBe(true);
    expect(declare("周记", icon)).toBe(false);
    expect(declare("每周笔记", icon)).toBe(true);
    expect(() => declare("周记", "<img src=x>")).toThrow("图标无效");
    expect(() => declare("")).toThrow("类型名无效");
    expect(PluginEntityTable.kinds(db, { databaseName: ":memory:" })).toEqual([
      { pluginId: "tau.weekly-review", kind: "note", label: "每周笔记", icon },
    ]);

    const created = await note("2026-W43");
    expect(
      PluginEntityTable.owners(db, { databaseName: ":memory:", ids: [created.id, 999] })
    ).toEqual([{ id: created.id, pluginId: "tau.weekly-review", kind: "note" }]);

    const now = Date.now();
    PluginEntityTable.collectOrphans(db, { installed: new Set(), now, graceMs: 7 * DAY });
    // 宽限期内内容还在，外观保留
    expect(PluginEntityTable.kinds(db, { databaseName: ":memory:" })).toHaveLength(1);
    PluginEntityTable.collectOrphans(db, {
      installed: new Set(),
      now: now + 8 * DAY,
      graceMs: 7 * DAY,
    });
    expect(PluginEntityTable.kinds(db, { databaseName: ":memory:" })).toEqual([]);
  });

  it("进入检索：定位、展示、结果详情与索引候选", async () => {
    const created = await note("2026-W43");
    const prepared = await (
      await import("../../services/content-execution")
    ).contentExecutor.execute<
      Awaited<ReturnType<typeof import("@/services/editorKit").prepareNewContent>>
    >({
      operation: "prepare-content",
      input: {
        nodes: [
          { type: "paragraph", children: [{ type: "formatted", text: "这周读完了《置身事内》" }] },
        ],
      },
    });
    ContentTable.updateContent(db, created.contentId, {
      ...prepared,
      expectedRevision: (await import("../tables/content-document")).ContentDocumentTable.read(
        db,
        created.contentId
      )!.revision,
    });
    const card = Number(
      db
        .prepare(
          "INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)"
        )
        .run(created.contentId).lastInsertRowid
    );
    // 与卡片共用正文时卡片优先
    expect(EntitySearchTable.locateAll(db, [created.contentId]).get(created.contentId)).toEqual([
      { kind: "card", id: card },
      { kind: "plugin-entity", id: created.id },
    ]);
    expect(
      EntitySearchTable.locate(db, { contentId: created.contentId, kind: "plugin-entity" })
    ).toEqual({ kind: "plugin-entity", id: created.id });
    expect(EntitySearchTable.resolve(db, "plugin-entity", created.id, 0)).toMatchObject({
      contentId: created.contentId,
      title: "周记 2026-W43",
      excerpt: "这周读完了《置身事内》",
    });
    expect(
      EntitySearchTable.search(db, { kind: "plugin-entity", keyword: "置身事内" }).map(
        item => item.id
      )
    ).toEqual([created.id]);
    expect(searchResultDetails(db, "plugin-entity", created.id)).toMatchObject({
      contentId: created.contentId,
      title: "周记 2026-W43",
      pluginEntity: { pluginId: "tau.weekly-review", kind: "note" },
    });
    const candidate = [...listContentIndexCandidates(db)].find(
      item => item.type === "plugin-entity"
    );
    expect(candidate).toMatchObject({ id: created.id, title: "周记 2026-W43" });
    expect(PluginEntityTable.indexDocs(db, created.id)[0].content).toEqual(prepared.content);
  });
});
