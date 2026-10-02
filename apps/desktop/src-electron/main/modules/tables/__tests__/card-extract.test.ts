import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { ECardCategory, type ICreateCard } from "@/types/card";
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => "/tmp" },
  ipcMain: { handle: vi.fn() },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import CardTable from "../card";
import EntityLineageTable from "../entity-lineage";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});
const card: ICreateCard = {
  content: [{ type: "paragraph", children: [{ type: "formatted", text: "观点" }] }],
  count: 2,
  category: ECardCategory.Permanent,
  tags: [],
  links: [],
  isTop: false,
};
const origin = {
  src: { kind: "article" as const, id: 3 },
  relation: "derived" as const,
  srcAnchor: { quote: { exact: "观点", prefix: "", suffix: "" } },
};
const create = () => CardTable.createScopedCard(db, { databaseName: ":memory:", card, origin });

describe("抽卡创建事务", () => {
  it("卡片与包含引述锚点的谱系共同保存", () => {
    const created = create();
    expect(EntityLineageTable.sourcesOf(db, [{ kind: "card", id: created.id }])[0]).toMatchObject({
      node: origin.src,
      anchor: origin.srcAnchor,
    });
  });
  it.each(["throw", "ignored"])("谱系失败（%s）回滚卡片、正文与操作记录", failure => {
    if (failure === "throw")
      vi.spyOn(EntityLineageTable, "record").mockImplementation(() => {
        throw new Error("写入失败");
      });
    else vi.spyOn(EntityLineageTable, "record").mockReturnValue(false);
    expect(create).toThrow();
    for (const table of ["cards", "contents", "operation", "entity_lineage"]) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
  });
  it("错误数据库不创建任何记录", () => {
    expect(() => CardTable.createScopedCard(db, { databaseName: "other", card, origin })).toThrow(
      "数据库已切换"
    );
    expect(db.prepare("SELECT COUNT(*) AS count FROM cards").get()).toEqual({ count: 0 });
  });
});
