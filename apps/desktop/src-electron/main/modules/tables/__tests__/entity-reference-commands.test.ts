// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { ContentIdentityTable } from "../content-identity";
import DataTableTable from "../data-table";
import DataTableViewTable from "../data-table-view";
import WhiteBoardContentTable from "../white-board-content";
import ProjectTable from "../project";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function database() {
  const db = new Database(":memory:");
  db.exec(schema);
  databases.push(db);
  return db;
}

describe("领域命令直接接纳稳定引用", () => {
  it("未转换库不能隐式建立来源，已转换库的新数据表从零引用开始", () => {
    const db = database();
    expect(() => DataTableTable.createPending(db)).toThrow("身份基线");
    ContentIdentityTable.establishBaseline(db);
    const created = DataTableTable.createPending(db);
    expect(created.table.refCount).toBe(0);
    expect(db.prepare("SELECT table_id FROM data_table_pending_releases").get()).toEqual({
      table_id: created.table.id,
    });
    expect(DataTableTable.getDetail(db, created.reference)).toMatchObject({
      table: { id: created.table.id },
    });
  });

  it("每次读写重新校验来源，同数字身份的另一资料库不能读写", () => {
    const first = database(),
      second = database();
    ContentIdentityTable.establishBaseline(first);
    ContentIdentityTable.establishBaseline(second);
    const a = DataTableTable.createPending(first),
      b = DataTableTable.createPending(second);
    expect(a.table.id).toBe(b.table.id);
    expect(() => DataTableTable.getDetail(second, a.reference)).toThrow("引用不属于");
    expect(() =>
      DataTableTable.update(second, { id: a.reference, columns: [], rows: [{ id: "wrong" }] })
    ).toThrow("引用不属于");
    expect(() =>
      DataTableTable.patchRow(second, {
        tableId: a.reference,
        rowId: "row",
        patch: {},
        expected: {},
      })
    ).toThrow("引用不属于");
    expect(DataTableTable.getById(second, b.table.id)?.rows).toEqual([]);
  });

  it("退役后拒绝迟到写入，视图更新、删除及激活也校验所属表", () => {
    const db = database();
    ContentIdentityTable.establishBaseline(db);
    const a = DataTableTable.createPending(db),
      b = DataTableTable.createPending(db);
    const foreignView = b.table.activeViewId!;
    expect(() => DataTableViewTable.remove(db, { id: foreignView, tableId: a.reference })).toThrow(
      "视图不属于"
    );
    expect(() =>
      DataTableViewTable.update(db, {
        ...DataTableViewTable.getById(db, foreignView)!,
        tableId: a.reference,
      })
    ).toThrow("视图不属于");
    expect(() =>
      DataTableTable.setActiveView(db, { tableId: a.reference, viewId: foreignView })
    ).toThrow("视图不属于");
    DataTableTable.getDetail(db, a.reference);
    ContentIdentityTable.retire(db, "data-table", a.table.id);
    const replacement = ContentIdentityTable.reference(db, "data-table", a.table.id);
    expect(replacement.entityId).not.toBe(a.reference.entityId);
    expect(() => DataTableTable.update(db, { id: a.reference, rows: [{ id: "stale" }] })).toThrow(
      "引用不属于"
    );
    expect(DataTableTable.getById(db, a.table.id)?.rows).toEqual([]);
  });

  it("白板和项目读入口拒绝错误来源与类型，不以同号对象回退", () => {
    const db = database();
    ContentIdentityTable.establishBaseline(db);
    db.prepare(
      "INSERT INTO project_item(id,title,children,create_time,update_time) VALUES (42,'项目','[]',1,1)"
    ).run();
    const project = ProjectTable.reference(db, 42);
    expect(ProjectTable.getProjectItem(db, project)?.id).toBe(42);
    expect(() => ProjectTable.getProjectItem(db, { ...project, sourceId: "different" })).toThrow(
      "引用不属于"
    );
    expect(() => WhiteBoardContentTable.getWhiteboardContent(db, project)).toThrow("类型不匹配");
    ContentIdentityTable.retire(db, "project-item", 42);
    expect(() => ProjectTable.getChildren(db, project)).toThrow("引用不属于");
  });
});
