import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  moveLegacyViewConfigKeys,
  upgradeDataTableViewOptions,
} from "../data-table-view-options-upgrade";

const MAIN_SQL = readFileSync(
  resolve(__dirname, "../../../../../../packages/db-schema/schema/main.sql"),
  "utf8"
);

describe("moveLegacyViewConfigKeys", () => {
  it("三种旧键各自移入对应 viewOptions 子键", () => {
    const config: Record<string, unknown> = {
      columnOrder: ["a"],
      galleryConfig: { coverType: "detail" },
      calendarConfig: { dateColumnId: "d" },
      kanbanConfig: { groupColumnId: "s" },
    };
    expect(moveLegacyViewConfigKeys(config)).toBe(true);
    expect(config).toEqual({
      columnOrder: ["a"],
      viewOptions: {
        gallery: { coverType: "detail" },
        calendar: { dateColumnId: "d" },
        kanban: { groupColumnId: "s" },
      },
    });
  });

  it("viewOptions 已有同名子键时以已有为准、丢弃旧键", () => {
    const config: Record<string, unknown> = {
      kanbanConfig: { groupColumnId: "old" },
      viewOptions: { kanban: { groupColumnId: "new" } },
    };
    moveLegacyViewConfigKeys(config);
    expect(config).toEqual({ viewOptions: { kanban: { groupColumnId: "new" } } });
  });

  it("空对象或非对象旧键删除但不迁移", () => {
    const config: Record<string, unknown> = {
      galleryConfig: {},
      calendarConfig: "bad",
      kanbanConfig: null,
    };
    expect(moveLegacyViewConfigKeys(config)).toBe(true);
    expect(config).toEqual({});
  });

  it("无旧键时不改不动（幂等）", () => {
    const config: Record<string, unknown> = {
      viewOptions: { kanban: { groupColumnId: "s" } },
    };
    expect(moveLegacyViewConfigKeys(config)).toBe(false);
    expect(config).toEqual({ viewOptions: { kanban: { groupColumnId: "s" } } });
  });
});

describe("upgradeDataTableViewOptions", () => {
  let db: Database.Database;
  const insertView = (config: string, updateTime = 1_000) =>
    Number(
      db
        .prepare(
          `INSERT INTO data_table_views (table_id, name, type, config, sort_order, create_time, update_time)
           VALUES (1, '视图', 'table', ?, 0, 1, ?)`
        )
        .run(config, updateTime).lastInsertRowid
    );
  const configOf = (id: number) =>
    db.prepare(`SELECT config, update_time FROM data_table_views WHERE id = ?`).get(id) as {
      config: string;
      update_time: number;
    };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SQL);
  });
  afterEach(() => db.close());

  it("迁移旧键、不改 update_time，其它键原样；重复执行无改动", () => {
    const id = insertView(
      JSON.stringify({
        columnOrder: ["a", "b"],
        rowOrder: ["r"],
        sorts: [{ id: "s", fieldId: "a", direction: "asc", priority: 0 }],
        filters: { id: "f", type: "group", logic: "and", children: [] },
        footer: { a: { kind: "aggregate", op: "sum" } },
        kanbanConfig: { groupColumnId: "s", columnOrder: ["x"] },
      }),
      777
    );
    expect(upgradeDataTableViewOptions(db)).toBe(1);
    const row = configOf(id);
    expect(row.update_time).toBe(777);
    expect(JSON.parse(row.config)).toEqual({
      columnOrder: ["a", "b"],
      rowOrder: ["r"],
      sorts: [{ id: "s", fieldId: "a", direction: "asc", priority: 0 }],
      filters: { id: "f", type: "group", logic: "and", children: [] },
      footer: { a: { kind: "aggregate", op: "sum" } },
      viewOptions: { kanban: { groupColumnId: "s", columnOrder: ["x"] } },
    });
    expect(upgradeDataTableViewOptions(db)).toBe(0);
    expect(configOf(id).config).toBe(row.config);
  });

  it("viewOptions 已有同名子键时保留已有子键、只删旧键", () => {
    const id = insertView(
      JSON.stringify({
        calendarConfig: { dateColumnId: "old" },
        viewOptions: { calendar: { dateColumnId: "new" } },
      })
    );
    expect(upgradeDataTableViewOptions(db)).toBe(1);
    expect(JSON.parse(configOf(id).config)).toEqual({
      viewOptions: { calendar: { dateColumnId: "new" } },
    });
  });

  it("空对象旧键删除但不迁移；无旧键的行不写回", () => {
    const emptyLegacy = insertView(JSON.stringify({ galleryConfig: {}, groupBy: null }));
    const clean = insertView(
      JSON.stringify({ columnOrder: [], viewOptions: { gallery: { coverType: "detail" } } })
    );
    const cleanBefore = configOf(clean).config;
    expect(upgradeDataTableViewOptions(db)).toBe(1);
    expect(JSON.parse(configOf(emptyLegacy).config)).toEqual({ groupBy: null });
    expect(configOf(clean).config).toBe(cleanBefore);
  });

  it("JSON 损坏的行跳过，不阻止其它行升级", () => {
    const broken = insertView('{"kanbanConfig": 坏的');
    const ok = insertView(JSON.stringify({ kanbanConfig: { groupColumnId: "s" } }));
    expect(upgradeDataTableViewOptions(db)).toBe(1);
    expect(configOf(broken).config).toBe('{"kanbanConfig": 坏的');
    expect(JSON.parse(configOf(ok).config).viewOptions).toEqual({
      kanban: { groupColumnId: "s" },
    });
  });
});
