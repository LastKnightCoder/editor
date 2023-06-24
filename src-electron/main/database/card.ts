import {Database} from "better-sqlite3";
import {ICard} from "../../../src/types";

export async function insertCard(db: Database, card: ICard): Promise<number | bigint> {
  const stmt = db.prepare(`INSERT INTO cards (create_time, update_time, tags, content) VALUES (?, ?, ?, ?)`);
  const res = stmt.run(Date.now(), Date.now(), card.tags, card.content);
  return res.lastInsertRowid;
}

export async function getAllCards(db: Database): Promise<ICard[]> {
  const stmt = db.prepare(`SELECT * FROM cards`);
  return stmt.all() as ICard[];
}

export async function deleteCard(db: Database, id: number): Promise<number> {
  const stmt = db.prepare(`DELETE FROM cards WHERE id = ?`);
  const res = stmt.run(id);
  return res.changes;
}

export async function updateCard(db: Database, card: ICard): Promise<number> {
  const stmt = db.prepare(`UPDATE cards SET update_time = ?, tags = ?, content = ? WHERE id = ?`);
  const res = stmt.run(Date.now(), card.tags, card.content, card.id);
  return res.changes;
}
