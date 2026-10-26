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
import PluginLinkTable from "../tables/plugin-links";
import PluginRefsTable from "../tables/plugin-refs";
import PluginDataTable from "../tables/plugin-data";

const scope = { databaseName: ":memory:", pluginId: "tau.questions" };
const DAY = 24 * 60 * 60 * 1000;

describe("PluginLinkTable", () => {
  let db: Database.Database;
  let seq = 0;
  const card = () =>
    Number(
      db
        .prepare(
          "INSERT INTO cards (create_time, update_time, tags, content_id) VALUES (?, 1, '[]', 0)"
        )
        .run(1000 + seq).lastInsertRowid
    );
  const question = async (key = "q") =>
    PluginEntityTable.create(db, {
      ...scope,
      input: { kind: "question", key, title: key, meta: {} },
    });
  const add = (
    from: number,
    to: { kind: string; id: string },
    options: { role?: string; readable?: boolean; data?: Record<string, unknown> } = {}
  ) =>
    PluginLinkTable.add(db, {
      ...scope,
      id: `link-${++seq}`,
      from,
      to,
      role: options.role ?? "",
      data: options.data ?? {},
      readable: options.readable ?? false,
    });

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("目标须是插件能看到的内容，失败时不透露是否存在", async () => {
    const { id } = await question();
    const cardId = card();
    const target = { kind: "card", id: String(cardId) };
    expect(() => add(id, target)).toThrow("不能关联");
    expect(() => add(id, { kind: "card", id: "9999" })).toThrow("不能关联");
    // 已获准读取卡片：不存在的明确报不存在
    expect(() => add(id, { kind: "card", id: "9999" }, { readable: true })).toThrow("不存在");
    // 用户选择过即可关联
    PluginRefsTable.grant(db, {
      databaseName: ":memory:",
      pluginId: scope.pluginId,
      refs: [target],
    });
    const link = add(id, target, { role: "material", data: { at: 3 } });
    expect(link).toMatchObject({ from: String(id), to: target, role: "material", data: { at: 3 } });
    // 重复添加返回已有的那条，不改 data
    expect(add(id, target, { role: "material", data: { at: 9 } })).toEqual(link);
    // 本插件自己的内容不需要授权；其他插件的实体不行
    const answer = await question("a");
    expect(add(id, { kind: "plugin-entity", id: String(answer.id) }, { role: "answer" }).role).toBe(
      "answer"
    );
    const other = await PluginEntityTable.create(db, {
      databaseName: ":memory:",
      pluginId: "other",
      input: { kind: "note", key: "n", title: "", meta: {} },
    });
    expect(() => add(id, { kind: "plugin-entity", id: String(other.id) })).toThrow("不能关联");
    // 来源只能是本插件的实体
    expect(() => PluginLinkTable.list(db, { ...scope, pluginId: "other", from: id })).toThrow(
      "内容不存在"
    );
  });

  it("按角色与顺序列出，重排须覆盖同一角色的全部关联", async () => {
    const { id } = await question();
    const targets = [card(), card(), card()].map(cardId => ({ kind: "card", id: String(cardId) }));
    const links = targets.map(target => add(id, target, { role: "material", readable: true }));
    const chat = add(id, targets[0], { role: "chat", readable: true });
    expect(PluginLinkTable.list(db, { ...scope, from: id }).map(link => link.id)).toEqual([
      chat.id,
      ...links.map(link => link.id),
    ]);
    expect(() =>
      PluginLinkTable.reorder(db, { ...scope, from: id, ids: [links[0].id, links[1].id] })
    ).toThrow("全部");
    expect(() =>
      PluginLinkTable.reorder(db, { ...scope, from: id, ids: [chat.id, links[0].id] })
    ).toThrow("同一角色");
    const reversed = [...links].reverse().map(link => link.id);
    PluginLinkTable.reorder(db, { ...scope, from: id, ids: reversed });
    expect(
      PluginLinkTable.list(db, { ...scope, from: id, role: "material" }).map(link => link.id)
    ).toEqual(reversed);
    PluginLinkTable.remove(db, { ...scope, id: links[0].id });
    PluginLinkTable.remove(db, { ...scope, id: links[0].id });
    expect(PluginLinkTable.list(db, { ...scope, from: id, role: "material" })).toHaveLength(2);
  });

  it("来源删除时关联随快照进「最近删除」，恢复后插回；孤儿超期时一并删除", async () => {
    const entity = await question();
    add(entity.id, { kind: "card", id: String(card()) }, { readable: true });
    PluginEntityTable.remove(db, { ...scope, id: entity.id, expectedRevision: entity.revision });
    expect(db.prepare("SELECT COUNT(*) AS n FROM plugin_links").get()).toEqual({ n: 0 });
    const [operation] = PluginDataTable.operations(db, scope);
    PluginDataTable.restore(db, { databaseName: ":memory:", id: operation.id });
    expect(PluginLinkTable.list(db, { ...scope, from: entity.id })).toHaveLength(1);

    const now = Date.now();
    PluginEntityTable.collectOrphans(db, { installed: new Set(), now, graceMs: 7 * DAY });
    PluginEntityTable.collectOrphans(db, {
      installed: new Set(),
      now: now + 8 * DAY,
      graceMs: 7 * DAY,
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM plugin_links").get()).toEqual({ n: 0 });
  });
});
