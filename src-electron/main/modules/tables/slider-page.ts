import Database from "better-sqlite3";
import Operation from "./operation";

export interface SliderPageRecord {
  id: number;
  deck_id: number;
  name: string;
  order_index: number;
  background: string; // JSON
  template_id: number | null;
  create_time: number;
  update_time: number;
}

export interface SliderPage {
  id: number;
  deckId: number;
  name: string;
  orderIndex: number;
  background: any;
  templateId: number | null;
  createTime: number;
  updateTime: number;
}

export default class SliderPageTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS slider_pages (
        id INTEGER PRIMARY KEY NOT NULL,
        deck_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        background TEXT DEFAULT '{}',
        template_id INTEGER,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 预留：表结构升级
  }

  private static parse(row: any): SliderPage {
    return {
      id: row.id,
      deckId: row.deck_id,
      name: row.name,
      orderIndex: row.order_index,
      background: JSON.parse(row.background || "{}"),
      templateId: row.template_id ?? null,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static getListenEvents() {
    return {
      "slider:create-page": this.createPage.bind(this),
      "slider:update-page": this.updatePage.bind(this),
      "slider:delete-page": this.deletePage.bind(this),
      "slider:get-page": this.getPage.bind(this),
      "slider:get-pages-by-deck": this.getPagesByDeck.bind(this),
      "slider:reorder-pages": this.reorderPages.bind(this),
    };
  }

  static createPage(
    db: Database.Database,
    page: Omit<SliderPage, "id" | "createTime" | "updateTime">,
  ): SliderPage {
    const stmt = db.prepare(`
      INSERT INTO slider_pages (deck_id, name, order_index, background, template_id, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      page.deckId,
      page.name,
      page.orderIndex ?? 0,
      JSON.stringify(page.background || {}),
      page.templateId ?? null,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "slider-page", "insert", id, now);
    return this.getPage(db, id);
  }

  static updatePage(
    db: Database.Database,
    page: Partial<Omit<SliderPage, "createTime" | "updateTime">> & {
      id: number;
    },
  ): SliderPage {
    const current = this.getPage(db, page.id);
    const stmt = db.prepare(`
      UPDATE slider_pages
      SET deck_id = ?, name = ?, order_index = ?, background = ?, template_id = ?, update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      page.deckId ?? current.deckId,
      page.name ?? current.name,
      page.orderIndex ?? current.orderIndex,
      JSON.stringify(page.background ?? current.background ?? {}),
      page.templateId ?? current.templateId,
      now,
      page.id,
    );
    Operation.insertOperation(db, "slider-page", "update", page.id, now);
    return this.getPage(db, page.id);
  }

  static deletePage(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM slider_pages WHERE id = ?");
    Operation.insertOperation(db, "slider-page", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getPage(db: Database.Database, id: number): SliderPage {
    const stmt = db.prepare("SELECT * FROM slider_pages WHERE id = ?");
    const row = stmt.get(id);
    if (!row) throw new Error(`SliderPage with id ${id} not found`);
    return this.parse(row);
  }

  static getPagesByDeck(db: Database.Database, deckId: number): SliderPage[] {
    const stmt = db.prepare(
      "SELECT * FROM slider_pages WHERE deck_id = ? ORDER BY order_index ASC, id ASC",
    );
    const rows = stmt.all(deckId);
    return rows.map((r) => this.parse(r));
  }

  static reorderPages(
    db: Database.Database,
    deckId: number,
    orderedPageIds: number[],
  ): boolean {
    const updateStmt = db.prepare(
      "UPDATE slider_pages SET order_index = ?, update_time = ? WHERE id = ? AND deck_id = ?",
    );
    const now = Date.now();
    for (let i = 0; i < orderedPageIds.length; i++) {
      updateStmt.run(i, now, orderedPageIds[i], deckId);
    }
    Operation.insertOperation(db, "slider-page", "reorder", deckId, now);
    return true;
  }
}
