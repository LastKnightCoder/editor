use rusqlite::{Connection, OptionalExtension};

const SCHEMA: &str = include_str!("../../../../../packages/db-schema/schema/device-sync-local.sql");
const HEALTH: &str =
    include_str!("../../../../../packages/db-schema/schema/device-sync-local-health.sql");
fn error(value: impl std::fmt::Display) -> String {
    format!("DEVICE_SYNC_LOCAL: {value}")
}
fn transaction<T>(
    conn: &Connection,
    write: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let name = format!("tau_local_{}", uuid::Uuid::new_v4().simple());
    conn.execute_batch(&format!("SAVEPOINT {name}"))
        .map_err(error)?;
    match write() {
        Ok(value) => {
            conn.execute_batch(&format!("RELEASE {name}"))
                .map_err(error)?;
            Ok(value)
        }
        Err(failure) => {
            let _ = conn.execute_batch(&format!("ROLLBACK TO {name}; RELEASE {name}"));
            Err(failure)
        }
    }
}
fn valid(value: &str) -> bool {
    value.is_empty() || uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value)
}
fn damaged(failure: &str) -> bool {
    failure.starts_with("DEVICE_SYNC_LOCAL_DAMAGED:")
        || [
            "no such column:",
            "no such table:",
            "Invalid column type",
            "Query returned no rows",
        ]
        .iter()
        .any(|message| failure.contains(message))
}

pub(super) fn ensure(conn: &Connection) -> Result<String, String> {
    let exists = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_tau_device_local'",
            [],
            |_| Ok(()),
        )
        .optional()
        .map_err(error)?
        .is_some();
    if !exists {
        let material=conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name GLOB '_tau_device_*' LIMIT 1").map_err(error)?.exists([]).map_err(error)?;
        transaction(conn, || {
            conn.execute_batch(SCHEMA).map_err(error)?;
            conn.execute(
                "INSERT INTO _tau_device_local(id,generation) VALUES(1,?1)",
                [if material {
                    uuid::Uuid::new_v4().to_string()
                } else {
                    String::new()
                }],
            )
            .map_err(error)?;
            Ok(())
        })?;
    }
    let read = (|| {
        if conn
            .prepare(HEALTH)
            .map_err(error)?
            .exists([])
            .map_err(error)?
        {
            return Err("DEVICE_SYNC_LOCAL_DAMAGED: 本机版本记录损坏".into());
        }
        conn.query_row(
            "SELECT generation FROM _tau_device_local WHERE id=1",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(error)
    })();
    match read {
        Ok(generation) => Ok(generation),
        Err(failure) => {
            if !damaged(&failure) {
                return Err(failure);
            }
            transaction(conn, || {
                let records = conn
                    .prepare("SELECT id,generation FROM _tau_device_local")
                    .and_then(|mut query| {
                        query
                            .query_map([], |row| {
                                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                            })?
                            .collect::<Result<Vec<_>, _>>()
                    })
                    .map_err(error);
                let retained = match records {
                    Ok(rows) if rows.len() == 1 && rows[0].0 == 1 && valid(&rows[0].1) => {
                        Some(rows[0].1.clone())
                    }
                    Err(failure) if !damaged(&failure) => return Err(failure),
                    _ => None,
                };
                conn.execute_batch(&format!(
                    "ALTER TABLE _tau_device_local RENAME TO _tau_device_quarantine_{}_local",
                    uuid::Uuid::new_v4().simple()
                ))
                .map_err(error)?;
                conn.execute_batch(SCHEMA).map_err(error)?;
                let generation = retained.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                conn.execute(
                    "INSERT INTO _tau_device_local(id,generation) VALUES(1,?1)",
                    [generation.clone()],
                )
                .map_err(error)?;
                if conn
                    .prepare(HEALTH)
                    .map_err(error)?
                    .exists([])
                    .map_err(error)?
                {
                    return Err("DEVICE_SYNC_LOCAL_DAMAGED: 本机版本重建失败".into());
                }
                Ok(generation)
            })
        }
    }
}
