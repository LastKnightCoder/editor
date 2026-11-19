use regex::Regex;
use rusqlite::{params, Connection};
use std::collections::BTreeSet;

const HIGH_WATER_SQL: &str =
    include_str!("../../../../../packages/db-schema/schema/row-id-high-water.sql");

fn identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

pub(super) fn tables(schema: &str) -> BTreeSet<String> {
    Regex::new(r"(?i)CREATE TABLE IF NOT EXISTS (\w+)\s*\(\s*id INTEGER PRIMARY KEY AUTOINCREMENT")
        .unwrap()
        .captures_iter(schema)
        .map(|capture| capture[1].to_owned())
        .collect()
}

struct SchemaObject {
    kind: String,
    name: String,
    table: String,
    sql: String,
}

pub(super) fn migrate(conn: &Connection, tables: &BTreeSet<String>) -> Result<(), String> {
    let objects = conn
        .prepare(
            "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid",
        )
        .map_err(|e| e.to_string())?
        .query_map([], |row| {
            Ok(SchemaObject {
                kind: row.get(0)?,
                name: row.get(1)?,
                table: row.get(2)?,
                sql: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let rebuild: Vec<_> = objects
        .iter()
        .filter(|object| {
            object.kind == "table"
                && tables.contains(&object.name)
                && !object.sql.to_ascii_uppercase().contains("AUTOINCREMENT")
        })
        .collect();
    if rebuild.is_empty() {
        return Ok(());
    }
    for object in objects
        .iter()
        .filter(|object| object.kind == "view" || object.kind == "trigger")
    {
        conn.execute_batch(&format!(
            "DROP {} {}",
            object.kind,
            identifier(&object.name)
        ))
        .map_err(|e| e.to_string())?;
    }
    let primary_key = Regex::new(r"(?i)\bid\s+INTEGER\s+PRIMARY\s+KEY\b").unwrap();
    for table in rebuild {
        let temporary = format!("_tau_row_id_{}", table.name);
        let start = table.sql.find('(').ok_or("无法读取表定义")?;
        let definition = &table.sql[start..];
        if !primary_key.is_match(definition) {
            return Err(format!("无法升级 {} 的编号定义", table.name));
        }
        let definition = primary_key.replace(definition, "$0 AUTOINCREMENT");
        let columns = conn
            .prepare(&format!("PRAGMA table_xinfo({})", identifier(&table.name)))
            .map_err(|e| e.to_string())?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, i64>(6)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|(_, hidden)| *hidden == 0)
            .map(|(name, _)| identifier(&name))
            .collect::<Vec<_>>()
            .join(",");
        conn.execute_batch(&format!(
            "CREATE TABLE {temporary} {definition};
             INSERT INTO {temporary} ({columns}) SELECT {columns} FROM {original};
             DROP TABLE {original}; ALTER TABLE {temporary} RENAME TO {original};",
            temporary = identifier(&temporary),
            original = identifier(&table.name)
        ))
        .map_err(|e| e.to_string())?;
        for index in objects
            .iter()
            .filter(|object| object.kind == "index" && object.table == table.name)
        {
            conn.execute_batch(&index.sql).map_err(|e| e.to_string())?;
        }
    }
    for kind in ["view", "trigger"] {
        for object in objects.iter().filter(|object| object.kind == kind) {
            conn.execute_batch(&object.sql).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub(super) fn seed_sequences(conn: &Connection, tables: &BTreeSet<String>) -> Result<(), String> {
    let floors = conn
        .prepare(HIGH_WATER_SQL)
        .map_err(|e| e.to_string())?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (table, id) in floors {
        if !tables.contains(&table) {
            continue;
        }
        if id > 9_007_199_254_740_991 {
            return Err(format!("{table} 的历史编号超出安全范围"));
        }
        conn.execute(
            "UPDATE sqlite_sequence SET seq=?1 WHERE name=?2 AND seq<?1",
            params![id, table],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO sqlite_sequence(name,seq) SELECT ?1,?2 WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name=?1)", params![table,id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(super) fn foreign_key_errors(
    conn: &Connection,
) -> Result<BTreeSet<(String, Option<i64>, String, i64)>, String> {
    conn.prepare("PRAGMA foreign_key_check")
        .map_err(|e| e.to_string())?
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())
}
