use rusqlite::{Connection, Result};
use simple_home_dir::home_dir;

pub mod card;
pub mod article;
pub mod history;

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
    let new_version = 1;
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
    Ok(())
}

fn init_card_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            links TEXT,
            content TEXT
        )",
        [],
    )?;
    Ok(())
}

fn init_article_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            create_time INTEGER NOT NULL,
            update_time INTEGER NOT NULL,
            tags TEXT,
            links TEXT,
            content TEXT
        )",
        [],
    )?;
    Ok(())
}

fn init_history_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY,
            create_time INTEGER NOT NULL,
            content TEXT,
            content_type TEXT,
            content_id INTEGER
        )",
        [],
    )?;
    Ok(())
}

fn upgrade_database(conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    upgrade_article_table(conn, old_version, new_version)?;
    Ok(())
}

fn upgrade_article_table(conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    println!("upgrade_article_table: {} -> {}", old_version, new_version);
    if old_version == new_version {
        return Ok(());
    }
    if old_version < 1 && new_version >= 1 {
        // 如果 articles 表没有 links 字段，添加 links 字段
        let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'articles'")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            let sql: String = row.get(0)?;
            println!("sql: {}", sql);
            if !sql.contains("links") {
                conn.execute(
                    "ALTER TABLE articles ADD COLUMN links TEXT",
                    [],
                )?;
            }
        }
    }
    Ok(())
}
