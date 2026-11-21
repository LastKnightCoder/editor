// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { ContentIdentityTable } from "../content-identity";
import DataTableTable from "../data-table";
import DataTableViewTable from "../data-table-view";
import WhiteboardContentTable from "../white-board-content";
import ProjectTable from "../project";
import { must } from "../../../test-support";

vi.mock("electron");
vi.mock("../../video-note-index-queue");
const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function database() {
  const db = new Database(":memory:");
  db.exec(schema);
  databases.push(db);
  return db;
}

describe("PDF 的稳定引用（白板 PDF 文档卡）", () => {
  const insertPdf = (db: Database.Database, createTime: number) =>
    Number(
      db
        .prepare(
          "INSERT INTO pdfs (create_time, update_time, is_local, file_name, file_path) VALUES (?, ?, 1, 'a.pdf', '/a.pdf')"
        )
        .run(createTime, createTime).lastInsertRowid
    );

  it("引用能解析回同一份 PDF；删除后同编号的新 PDF 不会被旧引用认领", () => {
    const db = database();
    ContentIdentityTable.establishBaseline(db);
    const id = insertPdf(db, 1000);
    const reference = ContentIdentityTable.reference(db, "pdf", id);
    expect(ContentIdentityTable.resolve(db, reference)).toBe(id);

    db.prepare("DELETE FROM pdfs WHERE id = ?").run(id);
    db.prepare(
      "INSERT INTO pdfs (id, create_time, update_time, is_local, file_name, file_path) VALUES (?, 2000, 2000, 1, 'b.pdf', '/b.pdf')"
    ).run(id);
    expect(ContentIdentityTable.resolve(db, reference)).toBeNull();
  });
});

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
    const foreignView = must(b.table.activeViewId, "b.table.activeViewId");
    expect(() => DataTableViewTable.remove(db, { id: foreignView, tableId: a.reference })).toThrow(
      "视图不属于"
    );
    expect(() =>
      DataTableViewTable.update(db, {
        ...must(
          DataTableViewTable.getById(db, foreignView),
          "DataTableViewTable.getById(db, foreignView)"
        ),
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
    expect(() => WhiteboardContentTable.getWhiteboardContent(db, project)).toThrow("类型不匹配");
    ContentIdentityTable.retire(db, "project-item", 42);
    expect(() => ProjectTable.getChildren(db, project)).toThrow("引用不属于");
  });
});
