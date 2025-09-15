import Database from "better-sqlite3";
import Operation from "./operation";

export interface SliderTemplateRecord {
  id: number;
  set_id: number;
  key: string;
  name: string;
  category: string; // cover/title/content/...
  default_page: string; // JSON
  default_blocks: string; // JSON array of blocks
  preview: string; // optional
  create_time: number;
  update_time: number;
}

export interface SliderTemplate {
  id: number;
  setId: number;
  key: string;
  name: string;
  category: string;
  defaultPage: any;
  defaultBlocks: any[];
  preview: string;
  createTime: number;
  updateTime: number;
}

export default class SliderTemplateTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS slider_templates (
        id INTEGER PRIMARY KEY NOT NULL,
        set_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        default_page TEXT NOT NULL,
        default_blocks TEXT NOT NULL,
        preview TEXT DEFAULT '',
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        UNIQUE(set_id, key)
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 预留：表结构升级
  }

  private static parse(row: any): SliderTemplate {
    return {
      id: row.id,
      setId: row.set_id,
      key: row.key,
      name: row.name,
      category: row.category,
      defaultPage: JSON.parse(row.default_page || "{}"),
      defaultBlocks: JSON.parse(row.default_blocks || "[]"),
      preview: row.preview || "",
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static getListenEvents() {
    return {
      "slider:create-template": this.createTemplate.bind(this),
      "slider:update-template": this.updateTemplate.bind(this),
      "slider:delete-template": this.deleteTemplate.bind(this),
      "slider:get-templates-by-set": this.getTemplatesBySet.bind(this),
    };
  }

  static createTemplate(
    db: Database.Database,
    tpl: Omit<SliderTemplate, "id" | "createTime" | "updateTime">,
  ): SliderTemplate {
    const stmt = db.prepare(`
      INSERT INTO slider_templates (set_id, key, name, category, default_page, default_blocks, preview, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      tpl.setId,
      tpl.key,
      tpl.name,
      tpl.category,
      JSON.stringify(tpl.defaultPage || {}),
      JSON.stringify(tpl.defaultBlocks || []),
      tpl.preview || "",
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "slider-template", "insert", id, now);
    return this.getTemplateById(db, id);
  }

  static updateTemplate(
    db: Database.Database,
    tpl: Partial<Omit<SliderTemplate, "createTime" | "updateTime">> & {
      id: number;
    },
  ): SliderTemplate {
    const current = this.getTemplateById(db, tpl.id);
    const stmt = db.prepare(`
      UPDATE slider_templates
      SET set_id = ?, key = ?, name = ?, category = ?, default_page = ?, default_blocks = ?, preview = ?, update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      tpl.setId ?? current.setId,
      tpl.key ?? current.key,
      tpl.name ?? current.name,
      tpl.category ?? current.category,
      JSON.stringify(tpl.defaultPage ?? current.defaultPage ?? {}),
      JSON.stringify(tpl.defaultBlocks ?? current.defaultBlocks ?? []),
      tpl.preview ?? current.preview,
      now,
      tpl.id,
    );
    Operation.insertOperation(db, "slider-template", "update", tpl.id, now);
    return this.getTemplateById(db, tpl.id);
  }

  static deleteTemplate(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM slider_templates WHERE id = ?");
    Operation.insertOperation(db, "slider-template", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getTemplateById(db: Database.Database, id: number): SliderTemplate {
    const stmt = db.prepare("SELECT * FROM slider_templates WHERE id = ?");
    const row = stmt.get(id);
    if (!row) throw new Error(`SliderTemplate with id ${id} not found`);
    return this.parse(row);
  }

  static getTemplatesBySet(
    db: Database.Database,
    setId: number,
  ): SliderTemplate[] {
    const stmt = db.prepare(
      "SELECT * FROM slider_templates WHERE set_id = ? ORDER BY name ASC",
    );
    const rows = stmt.all(setId);
    return rows.map((r) => this.parse(r));
  }
}
