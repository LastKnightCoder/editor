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
import { getMarkdown } from "@/utils/markdown.ts";
import PluginDataTable, { PLUGIN_OPERATION_RETENTION_MS } from "../tables/plugin-data";

const scope = { databaseName: ":memory:", pluginId: "weekly" };
const ctx = { broadcastOthers: vi.fn(), broadcastAll: vi.fn() };

describe("PluginDataTable 写入", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    ctx.broadcastAll.mockClear();
  });
  afterEach(() => db.close());

  const contentOf = (contentId: number | null) =>
    getMarkdown(
      JSON.parse(
        (
          db.prepare("SELECT content FROM contents WHERE id = ?").get(contentId) as {
            content: string;
          }
        ).content
      )
    ).trim();

  it("新建卡片：Markdown 转为正文，通知所有窗口", () => {
    const card = PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { markdown: "# 标题\n\n正文", tags: ["读书"] } },
      ctx
    );
    expect(card.tags).toEqual(["读书"]);
    expect(contentOf(card.contentId)).toContain("正文");
    expect(ctx.broadcastAll).toHaveBeenCalledWith("card:updated", {
      databaseName: ":memory:",
      cardId: card.id,
    });
  });

  it("修改要求最新 revision，过期时报冲突", () => {
    const card = PluginDataTable.create(db, { ...scope, entity: "card", input: {} }, ctx);
    db.prepare("UPDATE cards SET update_time = update_time + 5 WHERE id = ?").run(card.id);
    expect(() =>
      PluginDataTable.update(
        db,
        {
          ...scope,
          entity: "card",
          id: card.id,
          patch: { pinned: true },
          expectedRevision: card.revision,
        },
        ctx
      )
    ).toThrow("PLUGIN_CONFLICT:");
    const fresh = PluginDataTable.get(db, { ...scope, entity: "card", id: card.id })!;
    const updated = PluginDataTable.update(
      db,
      {
        ...scope,
        entity: "card",
        id: card.id,
        patch: { pinned: true },
        expectedRevision: fresh.revision,
      },
      ctx
    );
    expect(updated.pinned).toBe(true);
  });

  it("删除保留快照与正文，7 天内恢复回原样", () => {
    const card = PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { markdown: "要删的卡", tags: ["甲"] } },
      ctx
    );
    PluginDataTable.remove(db, {
      ...scope,
      entity: "card",
      id: card.id,
      expectedRevision: card.revision,
    });
    expect(PluginDataTable.get(db, { ...scope, entity: "card", id: card.id })).toBeNull();
    expect(db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(card.contentId)).toEqual({
      ref_count: 0,
    });
    const [operation] = PluginDataTable.operations(db, scope);
    expect(operation).toMatchObject({ entity: "card", title: "要删的卡", restoredAt: null });

    const restored = PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx);
    expect(restored).toEqual({ entity: "card", id: card.id });
    const back = PluginDataTable.get(db, { ...scope, entity: "card", id: card.id })!;
    expect(back.tags).toEqual(["甲"]);
    expect(contentOf(back.contentId)).toBe("要删的卡");
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM content_pending_releases WHERE content_id = ?")
        .get(card.contentId)
    ).toEqual({ n: 0 });
    expect(() => PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx)).toThrow(
      "已经恢复过了"
    );
  });

  it("超过保留期的操作不能恢复，也不再列出", () => {
    const article = PluginDataTable.create(
      db,
      { ...scope, entity: "article", input: { title: "旧文章" } },
      ctx
    );
    PluginDataTable.remove(db, {
      ...scope,
      entity: "article",
      id: article.id,
      expectedRevision: article.revision,
    });
    const [operation] = PluginDataTable.operations(db, scope);
    db.prepare("UPDATE plugin_operations SET create_time = create_time - ?").run(
      PLUGIN_OPERATION_RETENTION_MS + 1
    );
    expect(PluginDataTable.operations(db, scope)).toEqual([]);
    expect(() => PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx)).toThrow("7 天");
  });

  it("修改正文：追加保留原内容，替换要求文字唯一，revision 过期时报冲突", () => {
    const card = PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { markdown: "第一段" } },
      ctx
    );
    const createdAt = (
      db.prepare("SELECT create_time FROM contents WHERE id = ?").get(card.contentId) as {
        create_time: number;
      }
    ).create_time;
    const read = () =>
      PluginDataTable.content(db, {
        ...scope,
        contentId: card.contentId!,
        createdAt,
        format: "markdown",
      })!;
    const target = { ...scope, contentId: card.contentId!, createdAt };
    const first = PluginDataTable.editContent(
      db,
      { ...target, edit: { op: "append", markdown: "第二段" }, expectedRevision: read().revision },
      ctx
    );
    expect(read().markdown).toMatch(/第一段[\s\S]*第二段/);
    expect(() =>
      PluginDataTable.editContent(
        db,
        { ...target, edit: { op: "append", markdown: "x" }, expectedRevision: "u:0" },
        ctx
      )
    ).toThrow("PLUGIN_CONFLICT:");
    expect(() =>
      PluginDataTable.editContent(
        db,
        {
          ...target,
          edit: { op: "replaceText", find: "段", markdown: "节" },
          expectedRevision: first.revision,
        },
        ctx
      )
    ).toThrow("出现了多次");
    PluginDataTable.editContent(
      db,
      {
        ...target,
        edit: { op: "replaceText", find: "第二段", markdown: "补充" },
        expectedRevision: read().revision,
      },
      ctx
    );
    expect(read().markdown).toMatch(/第一段[\s\S]*补充/);
  });

  it("拒绝删除项目文档与跨库写入", () => {
    expect(() =>
      PluginDataTable.remove(db, {
        ...scope,
        entity: "document" as "card",
        id: 1,
        expectedRevision: "1",
      })
    ).toThrow("不支持删除");
    expect(() =>
      PluginDataTable.create(
        db,
        { ...scope, databaseName: "other", entity: "card", input: {} },
        ctx
      )
    ).toThrow("数据库已切换");
  });
});
