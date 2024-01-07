use rusqlite::{Connection, Result};
use simple_home_dir::home_dir;

pub mod card;
pub mod article;
pub mod history;
pub mod operation;
pub mod daily_note;
pub mod document;
pub mod time_record;

use self::card::{init_card_table, upgrade_card_table};
use self::article::{init_article_table, upgrade_article_table};
use self::history::{init_history_table, upgrade_history_table};
use self::operation::{init_operation_table, upgrade_operation_table};
use self::daily_note::{init_daily_note_table, upgrade_daily_note_table};
use self::document::{init_document_table, init_document_item_table, upgrade_document_table, upgrade_document_items_table};
use self::time_record::{init_time_record_table};

pub fn init_database() -> Result<Connection, rusqlite::Error> {
    let home_dir = home_dir().unwrap();
    let editor_dir = home_dir.join(".editor");
    std::fs::create_dir_all(&editor_dir).unwrap();
    let db_path = editor_dir.join("test.db");
    let conn = Connection::open(&db_path)?;
    // 获取数据库版本
    let old_version = match conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)) {
        Ok(v) => v,
        Err(_) => 0,
    };
    let new_version = 2;
    if old_version < new_version {
        conn.pragma_update(None, "user_version", &new_version)?;
    }
    init_tables(&conn)?;
    upgrade_database(&conn, old_version, new_version)?;
    Ok(conn)
}

fn init_tables(conn: &Connection) -> Result<()> {
    init_card_table(conn)?;
    init_article_table(conn)?;
    init_history_table(conn)?;
    init_operation_table(conn)?;
    init_daily_note_table(conn)?;
    init_document_table(conn)?;
    init_document_item_table(conn)?;
    init_time_record_table(conn)?;
    Ok(())
}

fn upgrade_database(conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    upgrade_card_table(conn, old_version, new_version)?;
    upgrade_article_table(conn, old_version, new_version)?;
    upgrade_history_table(conn, old_version, new_version)?;
    upgrade_operation_table(conn, old_version, new_version)?;
    upgrade_daily_note_table(conn, old_version, new_version)?;
    upgrade_document_table(conn, old_version, new_version)?;
    upgrade_document_items_table(conn, old_version, new_version)?;
    Ok(())
}
