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
import WhiteBoardContentTable from "../tables/white-board-content";
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

  it("解析正文输入供宿主界面预填：不写入，空输入为空数组，copyOf 范围与写入一致", async () => {
    const nodes = [{ type: "paragraph", children: [{ type: "formatted", text: "预填" }] }];
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM contents").get() as { n: number }).n;
    const before = count();
    expect(await PluginDataTable.resolveContent(db, { ...scope, content: { nodes } })).toEqual(
      nodes
    );
    expect(
      await PluginDataTable.resolveContent(db, { ...scope, content: { markdown: " " } })
    ).toEqual([]);
    expect(count()).toBe(before);
    const source = await PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { content: { nodes } } },
      ctx
    );
    const createdAt = (
      db.prepare("SELECT create_time FROM contents WHERE id = ?").get(source.contentId) as {
        create_time: number;
      }
    ).create_time;
    expect(
      await PluginDataTable.resolveContent(db, {
        ...scope,
        content: { copyOf: { contentId: source.contentId!, createdAt } },
      })
    ).toEqual(nodes);
    await expect(
      PluginDataTable.resolveContent(db, {
        ...scope,
        content: { copyOf: { contentId: source.contentId!, createdAt: createdAt + 1 } },
      })
    ).rejects.toThrow("要复制的正文不存在");
    await expect(
      PluginDataTable.resolveContent(db, { databaseName: "other", content: { nodes } })
    ).rejects.toThrow("数据库已切换");
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

  it("白板：新建带一张空白画板页，只改信息不碰画板", async () => {
    const board = await PluginDataTable.create(
      db,
      {
        ...scope,
        entity: "whiteboard",
        input: { title: "思路", description: "草图", tags: ["课题"] },
      },
      ctx
    );
    expect(board).toMatchObject({
      entity: "whiteboard",
      title: "思路",
      description: "草图",
      tags: ["课题"],
      pageCount: 1,
      contentId: null,
    });
    const page = db.prepare("SELECT name, data FROM white_board_contents").get() as {
      name: string;
      data: string;
    };
    expect(page.name).toBe("思路");
    expect(JSON.parse(page.data)).toMatchObject({ children: [], version: 2 });

    db.prepare("UPDATE white_boards SET update_time = 1 WHERE id = ?").run(board.id);
    const updated = PluginDataTable.update(
      db,
      {
        ...scope,
        entity: "whiteboard",
        id: board.id,
        patch: { description: "", tags: [] },
        expectedRevision: "1",
      },
      ctx
    );
    expect(updated).toMatchObject({ title: "思路", description: "", tags: [], pageCount: 1 });
    expect(() =>
      PluginDataTable.update(
        db,
        {
          ...scope,
          entity: "whiteboard",
          id: board.id,
          patch: { title: "x" },
          expectedRevision: "1",
        },
        ctx
      )
    ).toThrow("PLUGIN_CONFLICT:");
  });

  it("项目：新建为空项目，修改标题、归档与置顶，可按时间分页查询", async () => {
    const first = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "另一个" } },
      ctx
    );
    expect(first).toMatchObject({
      entity: "project",
      title: "课题",
      archived: false,
      pinned: false,
      documentCount: 0,
    });
    db.prepare("UPDATE project SET update_time = 1 WHERE id = ?").run(first.id);
    const archived = PluginDataTable.update(
      db,
      {
        ...scope,
        entity: "project",
        id: first.id,
        patch: { archived: true, pinned: true },
        expectedRevision: "1",
      },
      ctx
    );
    expect(archived).toMatchObject({ title: "课题", archived: true, pinned: true });
    const page = PluginDataTable.query(db, {
      ...scope,
      entity: "project",
      query: { limit: 1, sort: "created" },
    });
    expect(page.items).toHaveLength(1);
    expect(page.cursor).toBeDefined();
  });

  it("项目目录：新建文档挂在根或父文档下，同一项目内按最终序号移动", async () => {
    const project = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    const doc = (title: string, parentId?: number) =>
      PluginDataTable.createDocument(db, {
        ...scope,
        input: { projectId: project.id, title, ...(parentId ? { parentId } : {}) },
      });
    const a = await doc("甲");
    const b = await doc("乙");
    const c = await doc("丙");
    const child = await doc("甲-1", a.id);
    const titles = () =>
      PluginDataTable.projectTree(db, { ...scope, projectId: project.id })!.map(node => [
        node.title,
        node.children.map(item => item.title),
      ]);
    expect(titles()).toEqual([
      ["甲", ["甲-1"]],
      ["乙", []],
      ["丙", []],
    ]);
    expect(PluginDataTable.projectTree(db, { ...scope, projectId: 999 })).toBeNull();
    expect(a).toMatchObject({ entity: "document", kind: "document", projectIds: [project.id] });

    const revisionOf = (id: number) =>
      String(
        (
          db.prepare("SELECT update_time FROM project_item WHERE id = ?").get(id) as {
            update_time: number;
          }
        ).update_time
      );
    const move = (id: number, from: number | null, to: number | null, index?: number) =>
      PluginDataTable.moveDocument(db, {
        ...scope,
        id,
        move: { projectId: project.id, from, to, ...(index !== undefined ? { index } : {}) },
        expectedRevision: revisionOf(id),
      });
    // 同一父节点内向后移：index 是移动后的序号
    move(a.id, null, null, 2);
    expect(titles().map(([title]) => title)).toEqual(["乙", "丙", "甲"]);
    move(a.id, null, null, 0);
    expect(titles().map(([title]) => title)).toEqual(["甲", "乙", "丙"]);
    // 跨父节点移动，省略 index 放在末尾
    move(c.id, null, a.id);
    expect(titles()).toEqual([
      ["甲", ["甲-1", "丙"]],
      ["乙", []],
    ]);
    expect(() => move(a.id, null, child.id)).toThrow("不能移动到这个位置");
    expect(() => move(b.id, a.id, null)).toThrow("不在 from 指定的位置");
    expect(() =>
      PluginDataTable.moveDocument(db, {
        ...scope,
        id: b.id,
        move: { projectId: project.id, from: null, to: a.id },
        expectedRevision: "0",
      })
    ).toThrow("PLUGIN_CONFLICT:");
    await expect(doc("孤儿", 999)).rejects.toThrow("父文档不在该项目中");
  });

  it("项目目录：引用卡片的条目带 ref，挂在多处的文档在多处列出", async () => {
    const project = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    const card = await PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { content: { markdown: "卡" } } },
      ctx
    );
    const shared = await PluginDataTable.createDocument(db, {
      ...scope,
      input: { projectId: project.id, title: "共用" },
    });
    const parent = await PluginDataTable.createDocument(db, {
      ...scope,
      input: { projectId: project.id, title: "父" },
    });
    const ref = db
      .prepare(
        `INSERT INTO project_item (create_time, update_time, title, content_id, children, parents,
           projects, ref_type, ref_id, white_board_content_id, project_item_type, tags)
         VALUES (1, 1, '卡片入口', ?, '[]', '[]', ?, 'card', ?, 0, 'document', '[]')`
      )
      .run(card.contentId, JSON.stringify([project.id]), card.id).lastInsertRowid;
    db.prepare("UPDATE project SET children = ? WHERE id = ?").run(
      JSON.stringify([shared.id, parent.id, Number(ref)]),
      project.id
    );
    db.prepare("UPDATE project_item SET children = ? WHERE id = ?").run(
      JSON.stringify([shared.id]),
      parent.id
    );
    const tree = PluginDataTable.projectTree(db, { ...scope, projectId: project.id })!;
    expect(tree.map(node => node.id)).toEqual([shared.id, parent.id, Number(ref)]);
    expect(tree[1].children.map(node => node.id)).toEqual([shared.id]);
    expect(tree[2].ref).toEqual({ kind: "card", id: card.id });
  });

  it("白板删除后画板页进入待回收，恢复后重新持有", async () => {
    const board = await PluginDataTable.create(
      db,
      { ...scope, entity: "whiteboard", input: { title: "思路" } },
      ctx
    );
    const pageId = (
      db
        .prepare("SELECT white_board_content_ids AS ids FROM white_boards WHERE id = ?")
        .get(board.id) as { ids: string }
    ).ids;
    const [page] = JSON.parse(pageId) as number[];
    const pending = () =>
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM white_board_content_pending_releases WHERE content_id = ?"
        )
        .get(page);
    PluginDataTable.remove(db, {
      ...scope,
      entity: "whiteboard",
      id: board.id,
      expectedRevision: board.revision,
    });
    expect(PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id })).toBeNull();
    expect(pending()).toEqual({ n: 1 });
    const [operation] = PluginDataTable.operations(db, scope);
    expect(operation).toMatchObject({ entity: "whiteboard", title: "思路" });
    expect(PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx)).toEqual({
      entity: "whiteboard",
      id: board.id,
    });
    expect(pending()).toEqual({ n: 0 });
    expect(PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id })).toMatchObject(
      { title: "思路", pageCount: 1 }
    );
  });

  it("画板页已过宽限期被回收时，白板无法恢复", async () => {
    const board = await PluginDataTable.create(
      db,
      { ...scope, entity: "whiteboard", input: { title: "旧" } },
      ctx
    );
    PluginDataTable.remove(db, {
      ...scope,
      entity: "whiteboard",
      id: board.id,
      expectedRevision: board.revision,
    });
    WhiteBoardContentTable.collectPendingReleases(db, { now: Date.now() + 1, graceMs: 0 });
    const [operation] = PluginDataTable.operations(db, scope);
    expect(() => PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx)).toThrow(
      "画板页已被清理"
    );
  });

  it("项目只能删除空项目，可恢复", async () => {
    const project = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    const doc = await PluginDataTable.createDocument(db, {
      ...scope,
      input: { projectId: project.id, title: "文" },
    });
    const revision = () =>
      String(
        (
          db.prepare("SELECT update_time FROM project WHERE id = ?").get(project.id) as {
            update_time: number;
          }
        ).update_time
      );
    expect(() =>
      PluginDataTable.remove(db, {
        ...scope,
        entity: "project",
        id: project.id,
        expectedRevision: revision(),
      })
    ).toThrow("项目里还有文档");
    const docRevision = PluginDataTable.get(db, {
      ...scope,
      entity: "document",
      id: doc.id,
    })!.revision;
    PluginDataTable.remove(db, {
      ...scope,
      entity: "document",
      id: doc.id,
      expectedRevision: docRevision,
    });
    PluginDataTable.remove(db, {
      ...scope,
      entity: "project",
      id: project.id,
      expectedRevision: revision(),
    });
    expect(PluginDataTable.get(db, { ...scope, entity: "project", id: project.id })).toBeNull();
    const operation = PluginDataTable.operations(db, scope).find(
      item => item.entity === "project"
    )!;
    PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx);
    expect(PluginDataTable.get(db, { ...scope, entity: "project", id: project.id })).toMatchObject({
      title: "课题",
      documentCount: 0,
    });
  });

  it("项目文档删除：从所有挂载处摘除，正文延迟释放，恢复后挂回原位置", async () => {
    const project = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    const doc = (title: string, parentId?: number) =>
      PluginDataTable.createDocument(db, {
        ...scope,
        input: {
          projectId: project.id,
          title,
          content: { markdown: title },
          ...(parentId ? { parentId } : {}),
        },
      });
    const a = await doc("甲");
    const target = await doc("目标");
    await doc("丙");
    const child = await doc("甲-1", a.id);
    // 让「目标」同时挂在「甲」下：多处挂载
    db.prepare("UPDATE project_item SET children = ? WHERE id = ?").run(
      JSON.stringify([child.id, target.id]),
      a.id
    );
    db.prepare("UPDATE project_item SET parents = ? WHERE id = ?").run(
      JSON.stringify([a.id]),
      target.id
    );
    const titles = () =>
      PluginDataTable.projectTree(db, { ...scope, projectId: project.id })!.map(node => [
        node.title,
        node.children.map(item => item.title),
      ]);
    const revisionOf = (id: number) =>
      PluginDataTable.get(db, { ...scope, entity: "document", id })!.revision;
    expect(() =>
      PluginDataTable.remove(db, {
        ...scope,
        entity: "document",
        id: a.id,
        expectedRevision: revisionOf(a.id),
      })
    ).toThrow("有子文档");

    PluginDataTable.remove(db, {
      ...scope,
      entity: "document",
      id: target.id,
      expectedRevision: revisionOf(target.id),
    });
    expect(titles()).toEqual([
      ["甲", ["甲-1"]],
      ["丙", []],
    ]);
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM content_pending_releases WHERE content_id = ?")
        .get(target.contentId)
    ).toEqual({ n: 1 });

    const operation = PluginDataTable.operations(db, scope).find(
      item => item.entity === "document"
    )!;
    expect(operation.title).toBe("目标");
    PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx);
    expect(titles()).toEqual([
      ["甲", ["甲-1", "目标"]],
      ["目标", []],
      ["丙", []],
    ]);
    expect(contentOf(target.contentId)).toBe("目标");
  });

  it("视频笔记不能由插件删除", async () => {
    const project = await PluginDataTable.create(
      db,
      { ...scope, entity: "project", input: { title: "课题" } },
      ctx
    );
    const doc = await PluginDataTable.createDocument(db, {
      ...scope,
      input: { projectId: project.id, title: "视频" },
    });
    db.prepare("UPDATE project_item SET project_item_type = 'video-note' WHERE id = ?").run(doc.id);
    expect(() =>
      PluginDataTable.remove(db, {
        ...scope,
        entity: "document",
        id: doc.id,
        expectedRevision: PluginDataTable.get(db, { ...scope, entity: "document", id: doc.id })!
          .revision,
      })
    ).toThrow("视频笔记");
  });

  it("拒绝未知类型与跨库写入", async () => {
    expect(() =>
      PluginDataTable.remove(db, {
        ...scope,
        entity: "folder" as "card",
        id: 1,
        expectedRevision: "1",
      })
    ).toThrow("未知的数据类型");
    await expect(
      PluginDataTable.create(
        db,
        { ...scope, databaseName: "other", entity: "card", input: {} },
        ctx
      )
    ).rejects.toThrow("数据库已切换");
  });
});
