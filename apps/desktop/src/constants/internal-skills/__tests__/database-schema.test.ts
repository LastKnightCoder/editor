import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import mainSchemaSql from "@tau/db-schema/schema/main.sql?raw";
import databaseSchemaDoc from "@tau/ai/skills/internal/database-schema.md?raw";

/** 由 SQLite 读取定义，跳过虚拟表的内部影子表。 */
function parseSchemaTables(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const db = new Database(":memory:");
  try {
    db.exec(sql);
    const definitions = db.prepare("PRAGMA table_list").all() as Array<{
      schema: string;
      name: string;
      type: string;
    }>;
    for (const table of definitions) {
      if (
        table.schema !== "main" ||
        table.name.startsWith("sqlite_") ||
        !["table", "virtual"].includes(table.type)
      )
        continue;
      const quoted = `"${table.name.replaceAll('"', '""')}"`;
      const columns = db.prepare(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string }>;
      tables.set(
        table.name,
        columns.map(column => column.name)
      );
    }
  } finally {
    db.close();
  }
  return tables;
}

/** 解析文档：### `表名` 小节 → 字段表第一列（按行序） */
function parseDocSections(doc: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of doc.split("\n")) {
    const heading = line.match(/^### `([^`]+)`/);
    if (heading) {
      current = heading[1];
      if (sections.has(current)) throw new Error(`重复表小节：${current}`);
      sections.set(current, []);
      continue;
    }
    const cell = line.match(/^\| `([^`]+)`/);
    if (cell && current) sections.get(current)?.push(cell[1]);
  }
  return sections;
}

// AI 内置 skill 的数据库文档必须与 schema 同步：改表必须同步本文档，此测试守护二者不漂移
describe("internal-skills/database-schema.md 与主库 schema 对账", () => {
  const schemaTables = parseSchemaTables(mainSchemaSql);
  const docSections = parseDocSections(databaseSchemaDoc);

  it("文档小节与主库表一一对应（无幽灵节、无缺失）", () => {
    expect([...docSections.keys()].sort()).toEqual([...schemaTables.keys()].sort());
  });

  it("每张表的字段名与顺序同建表语句一致", () => {
    const drift: string[] = [];
    for (const [table, columns] of schemaTables) {
      const docColumns = docSections.get(table) ?? [];
      if (docColumns.join(",") !== columns.join(",")) {
        drift.push(`${table}: 文档[${docColumns.join(",")}] schema[${columns.join(",")}]`);
      }
    }
    expect(drift, `文档与 schema 漂移：\n${drift.join("\n")}`).toEqual([]);
  });

  it("识别同一行尾部新增字段，避免漏读导致假通过", () => {
    const changed = mainSchemaSql.replace(
      "insights TEXT DEFAULT '');",
      "insights TEXT DEFAULT '', drift_probe TEXT);"
    );
    const columns = parseSchemaTables(changed).get("video_notes") ?? [];
    expect(columns).toContain("drift_probe");
    expect(columns).not.toEqual(docSections.get("video_notes"));
  });

  it("支持引号标识符、表级约束与虚拟表，不把影子表列为业务表", () => {
    const tables = parseSchemaTables(`CREATE TABLE "quoted table" (
      "display name" TEXT, "order" INTEGER, PRIMARY KEY("order"),
      CONSTRAINT title_unique UNIQUE("display name"), CHECK("order">=0)
    ); CREATE VIRTUAL TABLE fts_probe USING fts5(title,body);
    CREATE VIEW quoted_view AS SELECT * FROM "quoted table";`);
    expect([...tables.keys()].sort()).toEqual(["fts_probe", "quoted table"]);
    expect(tables.get("quoted table")).toEqual(["display name", "order"]);
    expect(tables.get("fts_probe")).toEqual(["title", "body"]);
  });
});
