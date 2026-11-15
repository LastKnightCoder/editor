// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { EProjectItemType } from "@/types/project";
import { executeDatabaseCommand } from "../../database-command";
import CardTable from "../card";
import ArticleTable from "../article";
import ProjectTable from "../project";
import DataTableTable from "../data-table";
import PluginDataTable from "../plugin-data";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

const scope = { databaseName: ":memory:", pluginId: "baseline.ownership" };
const text = "多种拥有者共同持有🙂";

function requireFixture<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`持有夹具缺少${label}`);
  return value;
}

describe("正文持有基准 F5：独立对账与插件恢复", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const fixture = async () => {
    const prepared = await prepareContentContract("host.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const paragraph = {
      type: "paragraph" as const,
      collabId: "fixture-node",
      tauContract: prepared.id,
      children: [{ type: "formatted" as const, text }],
    };
    const card = CardTable.createCard(db, {
      content: [paragraph],
      contracts: { [prepared.id]: prepared.contract },
      count: 0,
      tags: ["持有基准"],
      isTop: false,
    });
    const article = ArticleTable.buildArticleFromContent(db, card.contentId, "共享文章");
    const project = ProjectTable.createProject(db, {
      title: "共享项目",
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });
    const [, item] = ProjectTable.addRootProjectItem(db, project.id, {
      title: "共享文档",
      contentId: card.contentId,
      content: [],
      count: 0,
      children: [],
      refType: "",
      refId: 0,
      whiteBoardContentId: 0,
      projectItemType: EProjectItemType.Document,
    });
    const table = DataTableTable.create(db, {
      columns: [{ id: "rich", title: "正文", type: "rich-text" }],
      rows: [
        {
          id: "row",
          rich: [{ contentId: card.contentId }, { contentId: card.contentId }],
          detailContentId: card.contentId,
        },
      ],
    });
    return { card, article, project, item: requireFixture(item, "项目条目"), table };
  };

  // 仅按本夹具的三类业务行和固定 rich 字段独立计数，不调用生产引用收集器。
  const recount = () =>
    db
      .prepare(
        `WITH owners(content_id) AS (
          SELECT content_id FROM cards
          UNION ALL SELECT content_id FROM articles
          UNION ALL SELECT content_id FROM project_item
          UNION ALL
            SELECT CAST(json_extract(cell.value,'$.contentId') AS INTEGER)
            FROM data_tables t, json_each(t.rows) row,
                 json_each(json_extract(row.value,'$.rich')) cell
            WHERE t.ref_count>0
          UNION ALL
            SELECT CAST(json_extract(row.value,'$.detailContentId') AS INTEGER)
            FROM data_tables t, json_each(t.rows) row
            WHERE t.ref_count>0
        )
        SELECT c.id,c.ref_count AS stored,count(o.content_id) AS expected
        FROM contents c LEFT JOIN owners o ON o.content_id=c.id
        GROUP BY c.id ORDER BY c.id`
      )
      .all() as { id: number; stored: number; expected: number }[];

  const assertOwnership = (contentId: number, expected: number) => {
    expect(recount()).toEqual([{ id: contentId, stored: expected, expected }]);
    const content = requireFixture(
      db.prepare("SELECT content FROM content_snapshots WHERE id=?").get(contentId) as
        | { content: string }
        | undefined,
      "正文"
    );
    expect(JSON.parse(content.content)[0].children).toEqual([{ type: "formatted", text }]);
  };

  const removeCard = (cardId: number) => {
    const current = requireFixture(
      PluginDataTable.get(db, { ...scope, entity: "card", id: cardId }),
      "插件可读卡片"
    );
    executeDatabaseCommand(db, PluginDataTable.remove.bind(PluginDataTable), db, {
      ...scope,
      entity: "card",
      id: cardId,
      expectedRevision: current.revision,
    });
    return requireFixture(PluginDataTable.operations(db, scope)[0], "删除回执");
  };

  it("混合持有逐项释放后，插件恢复与表复活只恢复各自持有且清除待回收", async () => {
    const { card, article, project, item, table } = await fixture();
    assertOwnership(card.contentId, 6);
    const operation = removeCard(card.id);
    assertOwnership(card.contentId, 5);

    DataTableTable.remove(db, table.id);
    assertOwnership(card.contentId, 2);
    executeDatabaseCommand(
      db,
      ProjectTable.removeRootProjectItem.bind(ProjectTable),
      db,
      project.id,
      item.id
    );
    assertOwnership(card.contentId, 1);
    executeDatabaseCommand(db, ArticleTable.deleteArticleById.bind(ArticleTable), db, article.id, {
      deferContent: true,
    });
    assertOwnership(card.contentId, 0);
    expect(db.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([
      { content_id: card.contentId },
    ]);

    const restored = executeDatabaseCommand(db, PluginDataTable.restore.bind(PluginDataTable), db, {
      ...scope,
      id: operation.id,
    });
    expect(restored).toEqual({ entity: "card", id: card.id });
    assertOwnership(card.contentId, 1);
    expect(db.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([]);
    DataTableTable.incrementRefCount(db, table.id);
    assertOwnership(card.contentId, 4);
    expect(db.prepare("SELECT tags FROM cards WHERE id=?").get(card.id)).toEqual({
      tags: '["持有基准"]',
    });
    expect(
      db.prepare("SELECT id FROM articles UNION ALL SELECT id FROM project_item").all()
    ).toEqual([]);
    expect(() =>
      executeDatabaseCommand(db, PluginDataTable.restore.bind(PluginDataTable), db, {
        ...scope,
        id: operation.id,
      })
    ).toThrow("已经恢复过了");
    assertOwnership(card.contentId, 4);
  });

  it("插件恢复在插回业务行时失败，不提前增加持有或消费恢复回执，重试只恢复一次", async () => {
    const { card } = await fixture();
    const operation = removeCard(card.id);
    assertOwnership(card.contentId, 5);
    db.exec(`CREATE TRIGGER reject_restored_card BEFORE INSERT ON cards BEGIN
      SELECT RAISE(ABORT, '基准注入：恢复卡片失败');
    END`);
    const restore = () =>
      executeDatabaseCommand(db, PluginDataTable.restore.bind(PluginDataTable), db, {
        ...scope,
        id: operation.id,
      });
    expect(restore).toThrow("基准注入：恢复卡片失败");
    assertOwnership(card.contentId, 5);
    expect(db.prepare("SELECT id FROM cards").all()).toEqual([]);
    expect(
      db.prepare("SELECT restored_time FROM plugin_operations WHERE id=?").get(operation.id)
    ).toEqual({
      restored_time: null,
    });
    db.exec("DROP TRIGGER reject_restored_card");
    expect(restore()).toEqual({ entity: "card", id: card.id });
    assertOwnership(card.contentId, 6);
  });
});
