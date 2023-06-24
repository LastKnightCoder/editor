import * as BetterSqlite3 from "better-sqlite3";

export const initDatabase = (db: BetterSqlite3.Database) => {
  db.exec(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    tags TEXT,
    content TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      create_time INTEGER NOT NULL,
      update_time INTEGER NOT NULL,
      tags TEXT,
      content TEXT
  )`);
}