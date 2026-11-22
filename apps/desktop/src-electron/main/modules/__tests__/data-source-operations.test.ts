import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { createDatabaseStore } from "@tau/database";
import type {
  DataTableSourceKind,
  DataTableSourceScope,
  RowData,
} from "@tau/shared/database-types";
import { requireSourceDef } from "@/features/databases/data-sources";
import DatabaseItemTable from "../tables/database-item";
import DataTableTable from "../tables/data-table";
import DataTableSourceTable from "../tables/data-table-source";
import ContentTable from "../tables/content";
import ProjectTable from "../tables/project";
import DiaryTable from "../tables/diary";
import { must } from "../../test-support";

vi.mock("electron");
vi.mock("../video-note-index-queue");

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(schema);
});
afterEach(() => db.close());

function createLinked(kind: DataTableSourceKind, scope: DataTableSourceScope) {
  const fields = requireSourceDef(kind)
    .fields.filter(field => field.defaultOn)
    .map(field => field.key);
  return DatabaseItemTable.create(db, { title: kind, source: { kind, fields, scope } }).dataTableId;
}

function read(id: number) {
  return must(DataTableTable.getDetail(db, id).table, "读取关联表");
}

it.each(["article", "card", "document"] as const)("表格新增的空白 %s 继承源默认值与范围", kind => {
  const project = ProjectTable.createProject(db, {
    title: "项目",
    desc: [],
    children: [],
    archived: false,
    pinned: false,
  });
  const tags = ["工作", "读书"];
  const id = createLinked(kind, kind === "document" ? { projectId: project.id } : { tags });
  const table = read(id);
  const store = createDatabaseStore(table.columns, table.rows);
  store.getState().addRow();
  const change = must(store.getState().lastChange, "表格新增行");
  DataTableTable.applyChanges(db, { id, rows: change.rows });
  const [row] = read(id).rows;
  expect(row.id).toMatch(new RegExp(`^${kind}:\\d+$`));
  expect(read(id).rows).toHaveLength(1);
  expect(row.detailContentId).toBeGreaterThan(0);
  if (kind === "document")
    expect(ProjectTable.getProject(db, project.id).children).toContain(
      Number(row.id.split(":")[1])
    );
  else expect(row["src:tags"]).toEqual(tags);
  if (kind !== "card") expect(row["src:title"].length).toBeGreaterThan(0);
});

it("第二个窗口移走条目后，旧窗口的混合删除和写入整批回滚", () => {
  const scoped = createLinked("article", { tags: ["工作"] });
  const all = createLinked("article", {});
  const upsert = [{ id: "a" }, { id: "b" }];
  DataTableTable.applyChanges(db, {
    id: scoped,
    rows: { upsert, inserted: upsert.map(row => row.id), remove: [] },
  });
  const [moved, kept] = read(scoped).rows;
  DataTableTable.applyChanges(db, {
    id: all,
    rows: { upsert: [{ id: moved.id, "src:tags": ["其他"] }], remove: [] },
  });
  const before = read(all).rows;
  for (const rows of [
    { remove: [kept.id, moved.id], upsert: [] },
    { remove: [kept.id], upsert: [{ id: moved.id, "src:title": "过期改名" }] },
  ]) {
    expect(() => DataTableTable.applyChanges(db, { id: scoped, rows })).toThrow("移出当前范围");
    expect(read(all).rows).toEqual(before);
  }
  expect(
    DataTableTable.patchRow(db, {
      tableId: scoped,
      rowId: moved.id,
      patch: { "src:title": "过期" },
      expected: { "src:title": moved["src:title"] },
    })
  ).toBe(false);
});

it("同一批次先删除再改名失败时，文章与正文引用一起回滚", () => {
  const id = createLinked("article", {});
  DataTableTable.applyChanges(db, {
    id,
    rows: {
      upsert: [{ id: "a" }, { id: "b" }],
      inserted: ["a", "b"],
      remove: [],
    },
  });
  const before = read(id).rows;
  const [first, second] = before;
  const contentId = must(first.detailContentId, "文章正文");
  const count = () =>
    db.prepare("SELECT ref_count FROM contents WHERE id=?").pluck().get(contentId);
  const initialRefs = count();
  const notifications = { broadcastAll: vi.fn(), broadcastOthers: vi.fn() };
  expect(() =>
    DataTableTable.applyChanges(
      db,
      {
        id,
        rows: {
          remove: [first.id],
          upsert: [
            { id: second.id, "src:tags": ["将回滚"] },
            { id: second.id, "src:title": "" },
          ],
        },
      },
      notifications
    )
  ).toThrow("标题不能为空");
  expect(read(id).rows).toEqual(before);
  expect(notifications.broadcastAll).not.toHaveBeenCalled();
  expect(count()).toBe(initialRefs);
});

it("另一窗口调整范围与字段后，旧配置不能覆盖字段或在新范围创建条目", () => {
  const id = createLinked("article", { tags: ["原范围"] });
  const old = read(id);
  DataTableSourceTable.updateSource(db, {
    tableId: id,
    scope: { tags: ["新范围"] },
    fields: ["title", "author"],
  });
  expect(() =>
    DataTableTable.applyChanges(db, {
      id,
      expectedSource: old.source,
      columns: old.columns,
      rows: { upsert: [{ id: "tmp" }], inserted: ["tmp"], remove: [] },
    })
  ).toThrow("字段已更新");
  expect(() =>
    DataTableSourceTable.updateSource(db, {
      tableId: id,
      expectedSource: old.source,
      fields: ["title"],
    })
  ).toThrow("字段已更新");
  expect(read(id).source?.fields).toEqual(["title", "author"]);
  expect(db.prepare("SELECT count(*) FROM articles").pluck().get()).toBe(0);
});

it("移出范围保留行正文；源头删除并重读后释放私有正文与富文本的全部引用", () => {
  const id = createLinked("diary", { range: "all" });
  const entry = DiaryTable.createDiaryEntry(db, {
    type: "daily",
    date: "2000-01-01",
    weather: null,
    mood: null,
  });
  const table = read(id);
  const contentId = ContentTable.createPendingContent(db, { content: [] });
  const rich = { id: "note", type: "rich-text", title: "笔记" };
  DataTableTable.applyChanges(db, {
    id,
    columns: [...table.columns, rich],
    rows: {
      upsert: [
        { id: table.rows[0].id, detailContentId: contentId, note: [{ contentId, title: "笔记" }] },
      ],
      remove: [],
    },
  });
  const refs = () => db.prepare("SELECT ref_count FROM contents WHERE id=?").pluck().get(contentId);
  DataTableSourceTable.updateSource(db, { tableId: id, scope: { range: "month" } });
  expect(read(id).rows).toEqual([]);
  expect(refs()).toBe(2);
  DataTableSourceTable.updateSource(db, { tableId: id, scope: { range: "all" } });
  expect(read(id).rows[0].detailContentId).toBe(contentId);
  DiaryTable.deleteDiaryEntry(db, entry.id);
  expect(read(id).rows).toEqual([]);
  expect(refs()).toBe(0);
  expect(
    db
      .prepare("SELECT content_id FROM content_pending_releases WHERE content_id=?")
      .pluck()
      .get(contentId)
  ).toBe(contentId);
});

it.runIf(process.env.TAU_DATA_SOURCE_STRESS === "1")(
  "大批量写入、跨表移出范围和删除后，自建列与源条目保持一致",
  () => {
    const size = 3000;
    const scope = createLinked("article", { tags: ["甲", "乙"] });
    const all = createLinked("article", {});
    const note = { id: "note", title: "备注", type: "number" };
    const rows = Array.from({ length: size }, (_, n) => ({ id: `new-${n}`, note: n }));
    DataTableTable.applyChanges(db, {
      id: scope,
      columns: [...read(scope).columns, note],
      rows: { upsert: rows, inserted: rows.map(row => row.id), remove: [] },
    });
    const original = read(scope).rows;
    expect(new Set(original.map(row => row.note)).size).toBe(size);
    const moved = original.filter(row => row.note % 3 === 0);
    const removed = original.filter(row => row.note % 3 === 1);
    const remaining = original.filter(row => row.note % 3 === 2);
    const patch = (row: RowData) => ({ id: row.id, "src:tags": ["其他"] });
    DataTableTable.applyChanges(db, {
      id: all,
      rows: { upsert: moved.map(patch), remove: removed.map(row => row.id) },
    });
    expect(read(scope).rows.map(row => [row.id, row.note])).toEqual(
      remaining.map(row => [row.id, row.note])
    );
    expect(() =>
      DataTableTable.applyChanges(db, {
        id: scope,
        rows: { upsert: [], remove: original.map(row => row.id) },
      })
    ).toThrow();
    DataTableSourceTable.updateSource(db, { tableId: scope, scope: {} });
    const restored = read(scope).rows;
    expect(restored.map(row => [row.id, row.note])).toEqual(
      original.filter(row => row.note % 3 !== 1).map(row => [row.id, row.note])
    );
    // 两个已打开的表交错提交对同一实体不同字段的编辑。
    const target = restored[0].id;
    for (let i = 1; i <= 100; i++) {
      DataTableTable.applyChanges(db, {
        id: scope,
        rows: { upsert: [{ id: target, note: i }], remove: [] },
      });
      DataTableTable.applyChanges(db, {
        id: all,
        rows: { upsert: [{ id: target, "src:title": `编辑 ${i}` }], remove: [] },
      });
    }
    expect(read(scope).rows.find(row => row.id === target)).toMatchObject({
      note: 100,
      "src:title": "编辑 100",
    });
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(db.prepare("SELECT count(*) FROM articles").pluck().get()).toBe(2000);
  },
  120000
);
