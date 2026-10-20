import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const scope = { databaseName: ":memory:", pluginId: "tau.weekly-review" };
const DAY = 24 * 60 * 60 * 1000;

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
        { ref_count: number } | undefined
    )?.ref_count;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("新建持有一份空白正文，同一类型下 key 唯一，只读得到自己的内容", () => {
    const created = note("2026-W43");
    expect(created).toMatchObject({
      pluginId: "tau.weekly-review",
      kind: "note",
      key: "2026-W43",
      title: "周记 2026-W43",
      meta: { week: "2026-W43" },
    });
    expect(refCount(created.contentId)).toBe(1);
    expect(() => note("2026-W43")).toThrow("PLUGIN_CONFLICT:");
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

  it("按创建时间倒序分页，修改校验 revision", () => {
    const first = note("a");
    note("b");
    note("c");
    const page = PluginEntityTable.query(db, { ...scope, query: { kind: "note", limit: 2 } });
    expect(page.items).toHaveLength(2);
    const rest = PluginEntityTable.query(db, {
      ...scope,
      query: { kind: "note", limit: 2, cursor: page.cursor },
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

  it("插件目录不在时记孤儿，宽限期内重新出现即撤销，超期删除并延迟释放正文", () => {
    const created = note("2026-W43");
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
});
