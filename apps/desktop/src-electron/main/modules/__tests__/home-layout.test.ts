import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import HomeLayoutTable from "../tables/home-layout";

describe("HomeLayoutTable", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("整份保存，按保存顺序读回", () => {
    expect(HomeLayoutTable.get(db)).toEqual([]);
    const layout = [
      { id: "todos", hidden: false },
      { id: "plugin:a:panel", hidden: true },
      { id: "review", hidden: false },
    ];
    expect(HomeLayoutTable.save(db, layout)).toEqual(layout);
    HomeLayoutTable.save(db, [{ id: "review", hidden: false }]);
    expect(HomeLayoutTable.get(db)).toEqual([{ id: "review", hidden: false }]);
  });

  it("拒绝重复与无效 ID，失败不改已有布局", () => {
    HomeLayoutTable.save(db, [{ id: "review", hidden: false }]);
    const save = (entries: unknown) =>
      db.transaction(() => HomeLayoutTable.save(db, entries as never))();
    expect(() =>
      save([
        { id: "a", hidden: false },
        { id: "a", hidden: true },
      ])
    ).toThrow("重复");
    expect(() => save([{ id: "", hidden: false }])).toThrow("无效");
    expect(() => save("x")).toThrow("最多");
    expect(HomeLayoutTable.get(db)).toEqual([{ id: "review", hidden: false }]);
  });
});
