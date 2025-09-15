import Database from "better-sqlite3";
import Operation from "./operation";

export interface SliderDeckRecord {
  id: number;
  title: string;
  description: string;
  tags: string; // JSON string
  snapshot: string;
  template_set_id: number | null;
  create_time: number;
  update_time: number;
}

export interface SliderDeck {
  id: number;
  title: string;
  description: string;
  tags: string[];
  snapshot: string;
  templateSetId: number | null;
  createTime: number;
  updateTime: number;
}

export default class SliderDeckTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS slider_decks (
        id INTEGER PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        snapshot TEXT DEFAULT '',
        template_set_id INTEGER,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 预留：表结构升级
  }

  private static parse(row: SliderDeckRecord): SliderDeck {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      tags: JSON.parse(row.tags || "[]"),
      snapshot: row.snapshot || "",
      templateSetId: row.template_set_id ?? null,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static getListenEvents() {
    return {
      "slider:create-deck": this.createDeck.bind(this),
      "slider:update-deck": this.updateDeck.bind(this),
      "slider:delete-deck": this.deleteDeck.bind(this),
      "slider:get-deck": this.getDeck.bind(this),
      "slider:get-all-decks": this.getAllDecks.bind(this),
    };
  }

  static createDeck(
    db: Database.Database,
    deck: Omit<SliderDeck, "id" | "createTime" | "updateTime">,
  ): SliderDeck {
    const stmt = db.prepare(`
      INSERT INTO slider_decks (title, description, tags, snapshot, template_set_id, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      deck.title,
      deck.description || "",
      JSON.stringify(deck.tags || []),
      deck.snapshot || "",
      deck.templateSetId ?? null,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "slider-deck", "insert", id, now);
    return this.getDeck(db, id);
  }

  static updateDeck(
    db: Database.Database,
    deck: Partial<Omit<SliderDeck, "createTime" | "updateTime">> & {
      id: number;
    },
  ): SliderDeck {
    const current = this.getDeck(db, deck.id);
    const stmt = db.prepare(`
      UPDATE slider_decks
      SET title = ?, description = ?, tags = ?, snapshot = ?, template_set_id = ?, update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      deck.title ?? current.title,
      deck.description ?? current.description,
      JSON.stringify(deck.tags ?? current.tags ?? []),
      deck.snapshot ?? current.snapshot,
      deck.templateSetId ?? current.templateSetId,
      now,
      deck.id,
    );
    Operation.insertOperation(db, "slider-deck", "update", deck.id, now);
    return this.getDeck(db, deck.id);
  }

  static deleteDeck(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM slider_decks WHERE id = ?");
    Operation.insertOperation(db, "slider-deck", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getDeck(db: Database.Database, id: number): SliderDeck {
    const stmt = db.prepare("SELECT * FROM slider_decks WHERE id = ?");
    const row = stmt.get(id) as SliderDeckRecord | undefined;
    if (!row) throw new Error(`SliderDeck with id ${id} not found`);
    return this.parse(row);
  }

  static getAllDecks(db: Database.Database): SliderDeck[] {
    const stmt = db.prepare(
      "SELECT * FROM slider_decks ORDER BY update_time DESC",
    );
    const rows = stmt.all() as SliderDeckRecord[];
    return rows.map((r) => this.parse(r));
  }
}
