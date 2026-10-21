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
import PluginDataTable from "../tables/plugin-data";
import ContentTable from "../tables/content";
import { PLUGIN_OPERATION_RETENTION_MS } from "../tables/plugin-operations";

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

  it("新建卡片：Markdown 转为正文，通知所有窗口", async () => {
    const card = await PluginDataTable.create(
      db,
      {
        ...scope,
        entity: "card",
        input: { content: { markdown: "# 标题\n\n正文" }, tags: ["读书"] },
      },
      ctx
    );
    expect(card.tags).toEqual(["读书"]);
    expect(contentOf(card.contentId)).toContain("正文");
    expect(ctx.broadcastAll).toHaveBeenCalledWith("card:updated", {
      databaseName: ":memory:",
      cardId: card.id,
    });
  });

  it("修改要求最新 revision，过期时报冲突", async () => {
    const card = await PluginDataTable.create(db, { ...scope, entity: "card", input: {} }, ctx);
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

  it("删除保留快照与正文，7 天内恢复回原样", async () => {
    const card = await PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { content: { markdown: "要删的卡" }, tags: ["甲"] } },
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

  it("超过保留期的操作不能恢复，也不再列出", async () => {
    const article = await PluginDataTable.create(
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

  it("修改正文：追加保留原内容，替换要求文字唯一，revision 过期时报冲突", async () => {
    const card = await PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { content: { markdown: "第一段" } } },
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
    const first = await PluginDataTable.editContent(
      db,
      {
        ...target,
        edit: { op: "append", content: { markdown: "第二段" } },
        expectedRevision: (await read())!.revision,
      },
      ctx
    );
    expect((await read())!.markdown).toMatch(/第一段[\s\S]*第二段/);
    await expect(
      PluginDataTable.editContent(
        db,
        { ...target, edit: { op: "append", content: { markdown: "x" } }, expectedRevision: "u:0" },
        ctx
      )
    ).rejects.toThrow("PLUGIN_CONFLICT:");
    await expect(
      PluginDataTable.editContent(
        db,
        {
          ...target,
          edit: { op: "replaceText", find: "段", markdown: "节" },
          expectedRevision: first.revision,
        },
        ctx
      )
    ).rejects.toThrow("出现了多次");
    await PluginDataTable.editContent(
      db,
      {
        ...target,
        edit: { op: "replaceText", find: "第二段", markdown: "补充" },
        expectedRevision: (await read())!.revision,
      },
      ctx
    );
    expect((await read())!.markdown).toMatch(/第一段[\s\S]*补充/);
    const revision = (await read())!.revision;
    const pending = PluginDataTable.editContent(
      db,
      {
        ...target,
        expectedRevision: revision,
        edit: { op: "append", content: { markdown: "迟到修改" } },
      },
      ctx
    );
    db.prepare("UPDATE contents SET update_time = update_time + 100 WHERE id = ?").run(
      card.contentId
    );
    await expect(pending).rejects.toThrow("转换期间");
    expect(contentOf(card.contentId)).not.toContain("迟到修改");
  });

  it("正文输入：nodes 原样写入，copyOf 复制当前正文、之后互不影响", async () => {
    const rawOf = (contentId: number | null) =>
      JSON.parse(
        (
          db.prepare("SELECT content FROM contents WHERE id = ?").get(contentId) as {
            content: string;
          }
        ).content
      );
    const createdAtOf = (contentId: number | null) =>
      (
        db.prepare("SELECT create_time FROM contents WHERE id = ?").get(contentId) as {
          create_time: number;
        }
      ).create_time;
    // 未安装插件的节点与自定义字段原样保留（ER-006）
    const nodes = [
      {
        type: "uninstalled-plugin-node",
        source: "x^2",
        children: [{ type: "formatted", text: "" }],
      },
      { type: "paragraph", children: [{ type: "formatted", text: "高亮", highlight: "yellow" }] },
    ];
    const source = await PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { content: { nodes } } },
      ctx
    );
    expect(rawOf(source.contentId)).toEqual(nodes);

    const copyOf = { contentId: source.contentId!, createdAt: createdAtOf(source.contentId) };
    const copy = await PluginDataTable.create(
      db,
      { ...scope, entity: "article", input: { title: "副本", content: { copyOf } } },
      ctx
    );
    expect(copy.contentId).not.toBe(source.contentId);
    expect(rawOf(copy.contentId)).toEqual(nodes);
    await PluginDataTable.editContent(
      db,
      {
        ...scope,
        ...copyOf,
        edit: { op: "replaceAll", content: { nodes: [] } },
        expectedRevision: (await PluginDataTable.content(db, {
          ...scope,
          ...copyOf,
          format: "nodes",
        }))!.revision,
      },
      ctx
    );
    expect(getMarkdown(rawOf(source.contentId)).trim()).toBe("");
    expect(rawOf(copy.contentId)).toEqual(nodes);

    const target = { contentId: copy.contentId!, createdAt: createdAtOf(copy.contentId) };
    const revision = (await PluginDataTable.content(db, { ...scope, ...target, format: "nodes" }))!
      .revision;
    await PluginDataTable.editContent(
      db,
      {
        ...scope,
        ...target,
        edit: { op: "append", content: { copyOf: target } },
        expectedRevision: revision,
      },
      ctx
    );
    expect(rawOf(copy.contentId)).toEqual([...nodes, ...nodes]);
  });

  it("正文输入：结构无效、来源不存在或不可寻址时拒绝", async () => {
    const create = (content: unknown) =>
      PluginDataTable.create(
        db,
        { ...scope, entity: "card", input: { content: content as { nodes: unknown[] } } },
        ctx
      );
    await expect(create({ nodes: [{ type: "paragraph", children: [] }] })).rejects.toThrow(
      "路径 0）"
    );
    await expect(create({ copyOf: { contentId: 999, createdAt: 1 } })).rejects.toThrow(
      "要复制的正文不存在"
    );
    const card = await create({ markdown: "来源" });
    const createdAt = (
      db.prepare("SELECT create_time FROM contents WHERE id = ?").get(card.contentId) as {
        create_time: number;
      }
    ).create_time;
    await expect(
      create({ copyOf: { contentId: card.contentId, createdAt: createdAt + 1 } })
    ).rejects.toThrow("要复制的正文不存在");
    // 没有卡片、文章、项目文档或插件实体持有的正文（如日记）不能复制
    const orphan = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "私密" }] }],
    } as never);
    const orphanCreatedAt = (
      db.prepare("SELECT create_time FROM contents WHERE id = ?").get(orphan) as {
        create_time: number;
      }
    ).create_time;
    await expect(
      create({ copyOf: { contentId: orphan, createdAt: orphanCreatedAt } })
    ).rejects.toThrow("要复制的正文不存在");
  });

  it("拒绝删除项目文档与跨库写入", async () => {
    expect(() =>
      PluginDataTable.remove(db, {
        ...scope,
        entity: "document" as "card",
        id: 1,
        expectedRevision: "1",
      })
    ).toThrow("不支持删除");
    await expect(
      PluginDataTable.create(
        db,
        { ...scope, databaseName: "other", entity: "card", input: {} },
        ctx
      )
    ).rejects.toThrow("数据库已切换");
  });
});
