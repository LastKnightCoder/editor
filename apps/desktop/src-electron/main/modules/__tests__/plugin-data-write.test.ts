import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";

const host = vi.hoisted(() => ({
  directory: "",
  databases: new Map<string, Database.Database>(),
}));
vi.mock("electron", () => ({
  app: { on: vi.fn(), getPath: () => "/tmp" },
  BrowserWindow: { getAllWindows: () => [], fromId: () => undefined },
  ipcMain: { handle: vi.fn() },
}));
vi.mock("../database", () => ({
  default: {
    databases: host.databases,
    getDatabase: (name: string) => host.databases.get(name),
    onDatabaseConnected: vi.fn(),
  },
}));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => host.directory },
}));
vi.mock("../collaboration", () => ({ default: { documentClient: vi.fn() } }));
vi.mock("../video-note-index-queue");

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
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import {
  createNodeDocument,
  WHITEBOARD_DOCUMENT_VERSION,
  WhiteboardModel,
} from "@tau/collaboration";
import { Awareness } from "y-protocols/awareness";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";
import {
  contentRevision,
  registerContentSession,
  unregisterContentSession,
} from "../collaboration/content-sessions";
import type { RuntimeSession } from "../collaboration/types";
import * as eventOrigin from "../domain-event-origin";

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import { getMarkdown } from "@/utils/markdown.ts";
import PluginDataTable from "../tables/plugin-data";
import ContentTable from "../tables/content";
import WhiteboardContentTable from "../tables/white-board-content";
import { PLUGIN_OPERATION_RETENTION_MS } from "../tables/plugin-operations";
import { executeDatabaseCommand } from "../database-command";
import whiteboardDocuments from "../whiteboard-documents";
import { WhiteboardDocumentRepository } from "../whiteboard-documents/repository";
import { must } from "../../test-support";

const scope = { databaseName: ":memory:", pluginId: "weekly" };
const ctx = { broadcastOthers: vi.fn(), broadcastAll: vi.fn() };

describe("PluginDataTable 写入", () => {
  let db: Database.Database;
  beforeAll(async () => {
    // 新建白板由文档会话托管，删除与回收不能绕过真实文档服务。
    host.directory = mkdtempSync(join(tmpdir(), "plugin-data-whiteboard-"));
    await whiteboardDocuments.init();
  });
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    host.databases.set(scope.databaseName, db);
    ctx.broadcastAll.mockClear();
  });
  afterEach(() => {
    whiteboardDocuments.sessions.dispose();
    host.databases.clear();
    db.close();
  });
  afterAll(() => {
    whiteboardDocuments.sessions.journal.close();
    whiteboardDocuments.installation.state.db.close();
    rmSync(host.directory, { recursive: true, force: true });
  });

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
    const fresh = must(
      PluginDataTable.get(db, { ...scope, entity: "card", id: card.id }),
      "PluginDataTable.get(db, { ...scope, entity: '..."
    );
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
    const back = must(
      PluginDataTable.get(db, { ...scope, entity: "card", id: card.id }),
      "PluginDataTable.get(db, { ...scope, entity: '..."
    );
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
      must(
        PluginDataTable.content(db, {
          ...scope,
          contentId: must(card.contentId, "card.contentId"),
          createdAt,
          format: "markdown",
        }),
        "PluginDataTable.content"
      );
    const target = { ...scope, contentId: must(card.contentId, "card.contentId"), createdAt };
    const first = await PluginDataTable.editContent(
      db,
      {
        ...target,
        edit: { op: "append", content: { markdown: "第二段" } },
        expectedRevision: must(await read(), "(await read())").revision,
      },
      ctx
    );
    expect(must(await read(), "(await read())").markdown).toMatch(/第一段[\s\S]*第二段/);
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
        expectedRevision: must(await read(), "(await read())").revision,
      },
      ctx
    );
    expect(must(await read(), "(await read())").markdown).toMatch(/第一段[\s\S]*补充/);
    const revision = must(await read(), "(await read())").revision;
    const pending = PluginDataTable.editContent(
      db,
      {
        ...target,
        expectedRevision: revision,
        edit: { op: "append", content: { markdown: "迟到修改" } },
      },
      ctx
    );
    const saved = must(
      ContentDocumentTable.read(db, must(card.contentId, "card.contentId")),
      "ContentDocumentTable.read(db, card.contentId!)"
    );
    const changed = structuredClone(saved);
    changed.content[0].children = [{ type: "formatted", text: "同时修改" }];
    ContentDocumentTable.commit(db, must(card.contentId, "card.contentId"), changed, {
      expectedRevision: saved.revision,
      count: 4,
    });
    await expect(pending).rejects.toThrow("转换期间");
    expect(contentOf(card.contentId)).not.toContain("迟到修改");
  });

  it("插件冷写流水失败时保留正文与引用，来源只在同步写入内生效", async () => {
    db.prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,data,ref_count) VALUES (7,1,1,'{}',0)"
    ).run();
    ContentIdentityTable.establishBaseline(db);
    const entityRef = ContentIdentityTable.bind(db, "whiteboard-content", 7, 1);
    const declaration = await prepareContentContract("host.whiteboard", {
      type: "whiteboard",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
    });
    const contentId = ContentTable.createContent(db, {
      content: [
        {
          type: "whiteboard",
          tauContract: declaration.id,
          entityRef,
          children: [{ text: "" }],
        },
      ] as never,
      contracts: { [declaration.id]: declaration.contract },
    });
    const source = must(
      ContentTable.getContentById(db, contentId),
      "ContentTable.getContentById(db, contentId)"
    );
    const referenceCount = () =>
      db.prepare("SELECT ref_count FROM white_board_contents WHERE id = 7").pluck().get();
    expect(referenceCount()).toBe(1);
    const snapshot = () =>
      [
        "contents",
        "content_documents",
        "content_entity_relations",
        "white_board_contents",
        "white_board_content_pending_releases",
        "operation",
      ].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const before = snapshot();
    const origins: Array<string | undefined> = [];
    db.function("capture_plugin_origin", () => {
      origins.push(eventOrigin.currentPluginOrigin());
      return null;
    });
    db.exec(`CREATE TEMP TRIGGER reject_plugin_content_operation BEFORE INSERT ON operation
      WHEN NEW.operation_content_type = 'content' AND NEW.operation_action = 'update'
      BEGIN
        SELECT capture_plugin_origin();
        SELECT RAISE(ABORT, '注入插件正文流水故障');
      END`);
    ctx.broadcastOthers.mockClear();
    const replace = () =>
      executeDatabaseCommand(
        db,
        PluginDataTable.getListenEvents()["plugin-data:edit-content"],
        db,
        {
          ...scope,
          contentId,
          createdAt: source.createTime,
          expectedRevision: must(source.revision, "source.revision"),
          edit: { op: "replaceAll", content: { markdown: "新正文" } },
        },
        ctx
      );
    await expect(replace()).rejects.toThrow("注入插件正文流水故障");
    expect(snapshot()).toEqual(before);
    expect(origins).toEqual([scope.pluginId]);
    expect(eventOrigin.contentOrigin(db.name, contentId)).toBeUndefined();
    expect(ctx.broadcastOthers).not.toHaveBeenCalled();

    db.exec("DROP TRIGGER reject_plugin_content_operation");
    await expect(replace()).resolves.toMatchObject({ revision: expect.any(String) });
    expect(referenceCount()).toBe(0);
    expect(contentOf(contentId)).toBe("新正文");
    expect(eventOrigin.contentOrigin(db.name, contentId)).toBeUndefined();
  });

  it("插件核对活跃会话代次并在正文接纳后标记来源", async () => {
    const card = await PluginDataTable.create(
      db,
      { ...scope, entity: "card", input: { content: { markdown: "活跃正文" } } },
      ctx
    );
    const contentId = must(card.contentId, "card.contentId");
    const saved = must(
      ContentDocumentTable.read(db, contentId),
      "ContentDocumentTable.read(db, contentId)"
    );
    const source = must(
      ContentTable.getContentById(db, contentId),
      "ContentTable.getContentById(db, contentId)"
    );
    const doc = await createNodeDocument(
      { documentId: saved.documentId, baselineId: "baseline", epoch: 0 },
      { title: "", bannerBg: "", bannerPosition: "center", content: saved.content },
      saved.contracts
    );
    const replaceContent = vi.fn<NonNullable<RuntimeSession["replaceContent"]>>();
    const session: RuntimeSession = {
      doc,
      awareness: new Awareness(doc),
      dirty: false,
      replaceContent,
      info: {
        id: saved.documentId,
        title: "活跃正文",
        ownerId: "local",
        role: "owner",
        status: "active",
        members: [],
        updatedAt: source.updateTime,
        mode: "local",
        serverUrl: "",
        connection: "idle",
        pending: false,
        leaving: false,
        source: {
          databaseName: scope.databaseName,
          contentId,
          contentCreatedAt: source.createTime,
          contentDocumentId: saved.documentId,
        },
      },
    };
    const reopened = { ...session };
    registerContentSession(db, contentId, session);
    const mark = vi.spyOn(eventOrigin, "markContentOrigin").mockImplementation(() => undefined);
    try {
      const request = {
        ...scope,
        contentId,
        createdAt: source.createTime,
        edit: { op: "replaceAll" as const, content: { markdown: "迟到的修改" } },
      };
      const replace = (expectedRevision: string) =>
        executeDatabaseCommand(
          db,
          PluginDataTable.getListenEvents()["plugin-data:edit-content"],
          db,
          { ...request, expectedRevision },
          ctx
        );
      await expect(replace(saved.revision)).rejects.toThrow("PLUGIN_CONFLICT:");
      const revision = contentRevision(session);
      const pending = replace(revision);
      registerContentSession(db, contentId, reopened);
      expect(contentRevision(reopened)).toBe(revision);
      await expect(pending).rejects.toThrow("转换期间正文已变化");
      expect(replaceContent).not.toHaveBeenCalled();
      expect(ContentDocumentTable.read(db, contentId)).toEqual(saved);

      replaceContent.mockRejectedValueOnce(new Error("耐久写入失败"));
      await expect(replace(revision)).rejects.toThrow("耐久写入失败");
      expect(mark).not.toHaveBeenCalled();

      replaceContent.mockImplementationOnce(
        async (_nodes, _contracts, expected, check, accepted) => {
          expect(expected).toBe(revision);
          check?.();
          expect(mark).not.toHaveBeenCalled();
          accepted?.();
          throw new Error("主库投影失败");
        }
      );
      await expect(replace(revision)).rejects.toThrow("主库投影失败");
      expect(mark).toHaveBeenCalledExactlyOnceWith(db.name, contentId, scope.pluginId);
    } finally {
      mark.mockRestore();
      unregisterContentSession(session);
      unregisterContentSession(reopened);
      session.awareness.destroy();
      doc.destroy();
    }
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
    const declaration = await prepareContentContract("uninstalled-plugin", {
      type: "uninstalled-plugin-node",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["source"] },
    });
    // 未安装插件也可按随正文保存的契约复制，节点副本获得新身份。
    const nodes = [
      {
        type: "uninstalled-plugin-node",
        tauContract: declaration.id,
        source: "x^2",
        children: [{ type: "formatted", text: "" }],
      },
      { type: "paragraph", children: [{ type: "formatted", text: "高亮", highlight: "yellow" }] },
    ];
    const create = PluginDataTable.getListenEvents()["plugin-data:create"];
    const source = await executeDatabaseCommand(
      db,
      create,
      db,
      {
        ...scope,
        entity: "card",
        input: { content: { nodes, contracts: { [declaration.id]: declaration.contract } } },
      },
      ctx
    );
    expect(rawOf(source.contentId)).toMatchObject(nodes);

    const copyOf = {
      contentId: must(source.contentId, "source.contentId"),
      createdAt: createdAtOf(source.contentId),
    };
    const copyArticle = () =>
      executeDatabaseCommand(
        db,
        create,
        db,
        { ...scope, entity: "article", input: { title: "副本", content: { copyOf } } },
        ctx
      );
    const creationState = () =>
      [
        "cards",
        "articles",
        "contents",
        "content_documents",
        "content_entity_relations",
        "content_pending_releases",
        "entity_identities",
        "library_identity",
        "migration_meta",
        "operation",
      ].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const beforeCopy = creationState();
    ctx.broadcastAll.mockClear();
    db.exec(`CREATE TEMP TRIGGER reject_copy_article_operation BEFORE INSERT ON operation
      WHEN NEW.operation_content_type = 'article' AND NEW.operation_action = 'insert'
      BEGIN SELECT RAISE(ABORT, '注入复制文章流水故障'); END`);
    await expect(copyArticle()).rejects.toThrow("注入复制文章流水故障");
    expect(creationState()).toEqual(beforeCopy);
    expect(ctx.broadcastAll).not.toHaveBeenCalled();
    db.exec("DROP TRIGGER reject_copy_article_operation");

    const copy = await copyArticle();
    expect(copy.contentId).not.toBe(source.contentId);
    expect(rawOf(copy.contentId)).toMatchObject(nodes);
    const sourceDocument = must(
      ContentDocumentTable.read(db, copyOf.contentId),
      "ContentDocumentTable.read(db, copyOf.contentId)"
    );
    const copyDocument = must(
      ContentDocumentTable.read(db, must(copy.contentId, "copy.contentId")),
      "ContentDocumentTable.read(db, copy.contentId!)"
    );
    expect(copyDocument.documentId).not.toBe(sourceDocument.documentId);
    expect(copyDocument.contracts).toEqual(sourceDocument.contracts);
    expect(
      new Set([...sourceDocument.content, ...copyDocument.content].map(node => node.collabId)).size
    ).toBe(4);
    expect(db.prepare("SELECT id,ref_count FROM contents ORDER BY id").all()).toEqual([
      { id: source.contentId, ref_count: 1 },
      { id: copy.contentId, ref_count: 1 },
    ]);
    expect(ctx.broadcastAll).toHaveBeenCalledWith("article:updated", {
      databaseName: ":memory:",
      articleId: copy.id,
    });
    await PluginDataTable.editContent(
      db,
      {
        ...scope,
        ...copyOf,
        edit: { op: "replaceAll", content: { nodes: [] } },
        expectedRevision: must(
          await PluginDataTable.content(db, {
            ...scope,
            ...copyOf,
            format: "nodes",
          }),
          "plugin content"
        ).revision,
      },
      ctx
    );
    expect(getMarkdown(rawOf(source.contentId)).trim()).toBe("");
    expect(rawOf(copy.contentId)).toMatchObject(nodes);

    const target = {
      contentId: must(copy.contentId, "copy.contentId"),
      createdAt: createdAtOf(copy.contentId),
    };
    const revision = must(
      await PluginDataTable.content(db, { ...scope, ...target, format: "nodes" }),
      "(await PluginDataTable.content(db, { ...scope..."
    ).revision;
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
    expect(rawOf(copy.contentId)).toMatchObject([...nodes, ...nodes]);
    expect(
      new Set(rawOf(copy.contentId).map((node: { collabId: string }) => node.collabId)).size
    ).toBe(4);
  });

  it("解析正文输入供宿主界面预填：不写入，空输入为空数组，copyOf 范围与写入一致", async () => {
    const nodes = [{ type: "paragraph", children: [{ type: "formatted", text: "预填" }] }];
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM contents").get() as { n: number }).n;
    const before = count();
    expect(
      await PluginDataTable.resolveContent(db, { ...scope, content: { nodes } })
    ).toMatchObject({ content: nodes });
    expect(
      await PluginDataTable.resolveContent(db, { ...scope, content: { markdown: " " } })
    ).toEqual({ content: [], contracts: {} });
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
        content: { copyOf: { contentId: must(source.contentId, "source.contentId"), createdAt } },
      })
    ).toMatchObject({ content: nodes });
    await expect(
      PluginDataTable.resolveContent(db, {
        ...scope,
        content: {
          copyOf: {
            contentId: must(source.contentId, "source.contentId"),
            createdAt: createdAt + 1,
          },
        },
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
    const page = db.prepare("SELECT * FROM white_board_contents").get() as {
      id: number;
      name: string;
      data: string;
    };
    const mapping = db
      .prepare("SELECT document_id,page_id FROM whiteboard_document_pages WHERE content_id=?")
      .get(page.id) as { document_id: string; page_id: string };
    const documentBefore = db.prepare("SELECT * FROM whiteboard_documents").get();
    const stored = must(
      new WhiteboardDocumentRepository(db, scope.databaseName).read(mapping.document_id),
      "新建白板文档"
    );
    expect(page.name).toBe("思路");
    expect(stored.boardId).toBe(board.id);
    expect(JSON.parse(page.data)).toMatchObject({
      children: [],
      version: WHITEBOARD_DOCUMENT_VERSION,
      documentKind: "whiteboard",
      documentId: mapping.document_id,
      pageId: mapping.page_id,
      epoch: stored.epoch,
      revision: stored.revision,
    });
    const doc = new Y.Doc();
    const model = new WhiteboardModel(doc);
    try {
      Y.applyUpdate(doc, stored.state);
      expect(model.read()).toMatchObject({
        title: "思路",
        pages: [{ id: mapping.page_id, title: "思路", children: [] }],
      });
    } finally {
      model.dispose();
      doc.destroy();
    }

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
    expect(db.prepare("SELECT * FROM white_board_contents").get()).toEqual(page);
    expect(db.prepare("SELECT * FROM whiteboard_documents").get()).toEqual(documentBefore);
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
      must(
        PluginDataTable.projectTree(db, { ...scope, projectId: project.id }),
        "PluginDataTable.projectTree(db, { ...scope, p..."
      ).map(node => [node.title, node.children.map(item => item.title)]);
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
    const tree = must(
      PluginDataTable.projectTree(db, { ...scope, projectId: project.id }),
      "PluginDataTable.projectTree(db, { ...scope, p..."
    );
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
    const pageBefore = db.prepare("SELECT data FROM white_board_contents WHERE id=?").get(page);
    const owner = () => db.prepare("SELECT document_id,board_id FROM whiteboard_documents").get();
    const documentBefore = owner();
    const refCount = () =>
      db.prepare("SELECT ref_count FROM white_board_contents WHERE id=?").get(page);
    const pending = () =>
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM white_board_content_pending_releases WHERE content_id = ?"
        )
        .get(page);
    const commands = PluginDataTable.getListenEvents();
    await executeDatabaseCommand(db, commands["plugin-data:delete"], db, {
      ...scope,
      entity: "whiteboard",
      id: board.id,
      expectedRevision: board.revision,
    });
    expect(PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id })).toBeNull();
    expect(pending()).toEqual({ n: 1 });
    expect(refCount()).toEqual({ ref_count: 0 });
    expect(owner()).toMatchObject({ board_id: null });
    const [operation] = PluginDataTable.operations(db, scope);
    expect(operation).toMatchObject({ entity: "whiteboard", title: "思路" });
    expect(
      executeDatabaseCommand(
        db,
        commands["plugin-data:restore"],
        db,
        { ...scope, id: operation.id },
        ctx
      )
    ).toEqual({
      entity: "whiteboard",
      id: board.id,
    });
    expect(pending()).toEqual({ n: 0 });
    expect(refCount()).toEqual({ ref_count: 1 });
    expect(owner()).toEqual(documentBefore);
    expect(db.prepare("SELECT data FROM white_board_contents WHERE id=?").get(page)).toEqual(
      pageBefore
    );
    expect(PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id })).toMatchObject(
      { title: "思路", pageCount: 1 }
    );
    const view = await whiteboardDocuments.sessions.open(scope.databaseName, page, 1, "restored");
    const beforeEdit = must(
      PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id }),
      "恢复后的白板"
    );
    const clock = vi.spyOn(Date, "now").mockReturnValue(Number(beforeEdit.revision) + 1);
    const doc = new Y.Doc();
    const model = new WhiteboardModel(doc);
    try {
      Y.applyUpdate(doc, view.state);
      const vector = Y.encodeStateVector(doc);
      model.submit([{ type: "edit_title", edit: { offset: 2, remove: 0, text: "续写" } }], null);
      await whiteboardDocuments.sessions.append(
        view.leaseId,
        1,
        "after-restore",
        Y.encodeStateAsUpdate(doc, vector)
      );
      expect(
        PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id })
      ).toMatchObject({
        title: "思路续写",
        pageCount: 1,
      });
      expect(() =>
        PluginDataTable.update(
          db,
          {
            ...scope,
            entity: "whiteboard",
            id: board.id,
            patch: { description: "过期修改" },
            expectedRevision: beforeEdit.revision,
          },
          ctx
        )
      ).toThrow("PLUGIN_CONFLICT:");
      expect(owner()).toEqual(documentBefore);
      expect(refCount()).toEqual({ ref_count: 1 });
      expect(pending()).toEqual({ n: 0 });
    } finally {
      clock.mockRestore();
      model.dispose();
      doc.destroy();
      await whiteboardDocuments.sessions.release(view.leaseId, 1);
    }
  });

  it("画板页已过宽限期被回收时，白板无法恢复", async () => {
    const board = await PluginDataTable.create(
      db,
      { ...scope, entity: "whiteboard", input: { title: "旧" } },
      ctx
    );
    const commands = PluginDataTable.getListenEvents();
    await executeDatabaseCommand(db, commands["plugin-data:delete"], db, {
      ...scope,
      entity: "whiteboard",
      id: board.id,
      expectedRevision: board.revision,
    });
    const now = Date.now() + 1;
    expect(whiteboardDocuments.collectPendingDocuments(db, now, 0)).toBe(1);
    expect(WhiteboardContentTable.collectPendingReleases(db, { now, graceMs: 0 })).toBe(1);
    const [operation] = PluginDataTable.operations(db, scope);
    expect(() =>
      executeDatabaseCommand(
        db,
        commands["plugin-data:restore"],
        db,
        { ...scope, id: operation.id },
        ctx
      )
    ).toThrow("画板页已被清理");
    expect(PluginDataTable.get(db, { ...scope, entity: "whiteboard", id: board.id })).toBeNull();
    expect(PluginDataTable.operations(db, scope)[0].restoredAt).toBeNull();
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
    const docRevision = must(
      PluginDataTable.get(db, {
        ...scope,
        entity: "document",
        id: doc.id,
      }),
      "PluginDataTable.get"
    ).revision;
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
    const operation = must(
      PluginDataTable.operations(db, scope).find(item => item.entity === "project"),
      "project operation"
    );
    PluginDataTable.restore(db, { ...scope, id: operation.id }, ctx);
    expect(PluginDataTable.get(db, { ...scope, entity: "project", id: project.id })).toMatchObject({
      title: "课题",
      documentCount: 0,
    });
  });

  it("项目文档删除回执失败时回滚全树挂载与正文持有，重试后可恢复", async () => {
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
      must(
        PluginDataTable.projectTree(db, { ...scope, projectId: project.id }),
        "PluginDataTable.projectTree(db, { ...scope, p..."
      ).map(node => [node.title, node.children.map(item => item.title)]);
    const revisionOf = (id: number) =>
      must(
        PluginDataTable.get(db, { ...scope, entity: "document", id }),
        "PluginDataTable.get(db, { ...scope, entity: '..."
      ).revision;
    const commands = PluginDataTable.getListenEvents();
    const remove = (id: number) =>
      executeDatabaseCommand(db, commands["plugin-data:delete"], db, {
        ...scope,
        entity: "document",
        id,
        expectedRevision: revisionOf(id),
      });
    await expect(remove(a.id)).rejects.toThrow("有子文档");

    const snapshot = () => ({
      roots: db.prepare("SELECT * FROM project ORDER BY id").all(),
      items: db.prepare("SELECT * FROM project_item ORDER BY id").all(),
      body: db.prepare("SELECT * FROM contents WHERE id = ?").get(target.contentId),
      pending: db.prepare("SELECT * FROM content_pending_releases ORDER BY content_id").all(),
      operations: db.prepare("SELECT * FROM operation ORDER BY id").all(),
      receipts: db.prepare("SELECT * FROM plugin_operations ORDER BY id").all(),
    });
    const before = snapshot();
    expect(before.body).toMatchObject({ ref_count: 1 });
    db.exec(`CREATE TEMP TRIGGER reject_project_delete_receipt BEFORE INSERT ON plugin_operations
      WHEN NEW.entity = 'document'
      BEGIN SELECT RAISE(ABORT, '注入项目文档删除回执故障'); END`);
    await expect(remove(target.id)).rejects.toThrow("注入项目文档删除回执故障");
    expect(snapshot()).toEqual(before);
    db.exec("DROP TRIGGER reject_project_delete_receipt");

    await remove(target.id);
    expect(titles()).toEqual([
      ["甲", ["甲-1"]],
      ["丙", []],
    ]);
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM content_pending_releases WHERE content_id = ?")
        .get(target.contentId)
    ).toEqual({ n: 1 });
    expect(snapshot().body).toMatchObject({ ref_count: 0 });

    const operation = must(
      PluginDataTable.operations(db, scope).find(item => item.entity === "document"),
      "document operation"
    );
    expect(operation.title).toBe("目标");
    expect(
      executeDatabaseCommand(
        db,
        commands["plugin-data:restore"],
        db,
        { ...scope, id: operation.id },
        ctx
      )
    ).toEqual({ entity: "document", id: target.id });
    expect(titles()).toEqual([
      ["甲", ["甲-1", "目标"]],
      ["目标", []],
      ["丙", []],
    ]);
    expect(contentOf(target.contentId)).toBe("目标");
    expect(snapshot().body).toMatchObject({ ref_count: 1 });
    expect(snapshot().pending).toEqual(before.pending);
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
        expectedRevision: must(
          PluginDataTable.get(db, { ...scope, entity: "document", id: doc.id }),
          "PluginDataTable.get(db, { ...scope, entity: '..."
        ).revision,
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
