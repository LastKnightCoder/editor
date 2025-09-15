import Database from "better-sqlite3";
import Operation from "./operation";

export interface SliderTemplateSetRecord {
  id: number;
  key: string;
  name: string;
  description: string;
  theme: string; // JSON
  cover: string; // optional url/base64
  create_time: number;
  update_time: number;
}

export interface SliderTemplateSet {
  id: number;
  key: string;
  name: string;
  description: string;
  theme: any;
  cover: string;
  createTime: number;
  updateTime: number;
}

export default class SliderTemplateSetTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS slider_template_sets (
        id INTEGER PRIMARY KEY NOT NULL,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        theme TEXT DEFAULT '{}',
        cover TEXT DEFAULT '',
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 预留：表结构升级
  }

  private static parse(row: any): SliderTemplateSet {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description || "",
      theme: JSON.parse(row.theme || "{}"),
      cover: row.cover || "",
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static getListenEvents() {
    return {
      "slider:create-template-set": this.createTemplateSet.bind(this),
      "slider:update-template-set": this.updateTemplateSet.bind(this),
      "slider:delete-template-set": this.deleteTemplateSet.bind(this),
      "slider:get-all-template-sets": this.getAllTemplateSets.bind(this),
    };
  }

  static createTemplateSet(
    db: Database.Database,
    set: Omit<SliderTemplateSet, "id" | "createTime" | "updateTime">,
  ): SliderTemplateSet {
    const stmt = db.prepare(`
      INSERT INTO slider_template_sets (key, name, description, theme, cover, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      set.key,
      set.name,
      set.description || "",
      JSON.stringify(set.theme || {}),
      set.cover || "",
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "slider-template-set", "insert", id, now);
    return this.getTemplateSetById(db, id);
  }

  static updateTemplateSet(
    db: Database.Database,
    set: Partial<Omit<SliderTemplateSet, "createTime" | "updateTime">> & {
      id: number;
    },
  ): SliderTemplateSet {
    const current = this.getTemplateSetById(db, set.id);
    const stmt = db.prepare(`
      UPDATE slider_template_sets
      SET key = ?, name = ?, description = ?, theme = ?, cover = ?, update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      set.key ?? current.key,
      set.name ?? current.name,
      set.description ?? current.description,
      JSON.stringify(set.theme ?? current.theme ?? {}),
      set.cover ?? current.cover,
      now,
      set.id,
    );
    Operation.insertOperation(db, "slider-template-set", "update", set.id, now);
    return this.getTemplateSetById(db, set.id);
  }

  static deleteTemplateSet(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM slider_template_sets WHERE id = ?");
    Operation.insertOperation(
      db,
      "slider-template-set",
      "delete",
      id,
      Date.now(),
    );
    return stmt.run(id).changes;
  }

  static getTemplateSetById(
    db: Database.Database,
    id: number,
  ): SliderTemplateSet {
    const stmt = db.prepare("SELECT * FROM slider_template_sets WHERE id = ?");
    const row = stmt.get(id);
    if (!row) throw new Error(`SliderTemplateSet with id ${id} not found`);
    return this.parse(row);
  }

  static getAllTemplateSets(db: Database.Database): SliderTemplateSet[] {
    const stmt = db.prepare(
      "SELECT * FROM slider_template_sets ORDER BY update_time DESC",
    );
    const rows = stmt.all();
    return rows.map((r) => this.parse(r));
  }
}
