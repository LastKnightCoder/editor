import type Database from "better-sqlite3";
import ROW_ID_HIGH_WATER_SQL from "@tau/db-schema/schema/row-id-high-water.sql?raw";

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string };
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function rowIdTables(schemaSql: string): Set<string> {
  return new Set(
    [
      ...schemaSql.matchAll(
        /CREATE TABLE IF NOT EXISTS (\w+)\s*\(\s*id INTEGER PRIMARY KEY AUTOINCREMENT/gi
      ),
    ].map(match => match[1])
  );
}

/** 保留旧库的实际列定义，避免结构升级丢失尚有消费者的额外字段。 */
export function migrateRowIds(db: Database.Database, tables: ReadonlySet<string>): void {
  const objects = db
    .prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid"
    )
    .all() as SchemaObject[];
  const rebuild = objects.filter(
    object =>
      object.type === "table" && tables.has(object.name) && !/\bAUTOINCREMENT\b/i.test(object.sql)
  );
  if (!rebuild.length) return;
  const dependent = objects.filter(object => object.type === "view" || object.type === "trigger");
  for (const object of dependent)
    db.exec(`DROP ${object.type.toUpperCase()} ${identifier(object.name)}`);
  for (const table of rebuild) {
    const temporary = `_tau_row_id_${table.name}`;
    const columnDefinition = /\bid\s+INTEGER\s+PRIMARY\s+KEY\b/i;
    if (!columnDefinition.test(table.sql)) throw new Error(`无法升级 ${table.name} 的编号定义`);
    const definition = table.sql
      .slice(table.sql.indexOf("("))
      .replace(columnDefinition, "$& AUTOINCREMENT");
    const columns = (
      db.prepare(`PRAGMA table_xinfo(${identifier(table.name)})`).all() as {
        name: string;
        hidden: number;
      }[]
    )
      .filter(column => column.hidden === 0)
      .map(column => identifier(column.name))
      .join(",");
    db.exec(`CREATE TABLE ${identifier(temporary)} ${definition}`);
    db.exec(
      `INSERT INTO ${identifier(temporary)} (${columns}) SELECT ${columns} FROM ${identifier(table.name)}`
    );
    db.exec(`DROP TABLE ${identifier(table.name)}`);
    db.exec(`ALTER TABLE ${identifier(temporary)} RENAME TO ${identifier(table.name)}`);
    for (const index of objects.filter(
      object => object.type === "index" && object.tbl_name === table.name
    ))
      db.exec(index.sql);
  }
  for (const type of ["view", "trigger"])
    for (const object of dependent.filter(object => object.type === type)) db.exec(object.sql);
}

export function seedRowIdSequences(db: Database.Database, tables: ReadonlySet<string>): void {
  const update = db.prepare("UPDATE sqlite_sequence SET seq=? WHERE name=? AND seq<?");
  const insert = db.prepare(
    "INSERT INTO sqlite_sequence(name,seq) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name=?)"
  );
  for (const { table_name: table, max_id: id } of db.prepare(ROW_ID_HIGH_WATER_SQL).all() as {
    table_name: string;
    max_id: number;
  }[]) {
    if (!tables.has(table)) continue;
    if (!Number.isSafeInteger(id)) throw new Error(`${table} 的历史编号超出安全范围`);
    update.run(id, table, id);
    insert.run(table, id, table);
  }
}
