import Database from "better-sqlite3";
import Operation from "./operation";

export type SliderBlockKind =
  | "flow-editor"
  | "absolute-editor"
  | "image"
  | "shape";

export interface SliderEditorBlockRecord {
  id: number;
  page_id: number;
  kind: string;
  content_id: number | null;
  geometry: string; // JSON
  style: string; // JSON
  order_index: number;
  create_time: number;
  update_time: number;
}

export interface SliderEditorBlock {
  id: number;
  pageId: number;
  kind: SliderBlockKind;
  contentId: number | null;
  geometry: any | null;
  style: any | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export default class SliderEditorBlockTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS slider_editor_blocks (
        id INTEGER PRIMARY KEY NOT NULL,
        page_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        content_id INTEGER,
        geometry TEXT,
        style TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // 预留：表结构升级
  }

  private static parse(row: any): SliderEditorBlock {
    return {
      id: row.id,
      pageId: row.page_id,
      kind: row.kind,
      contentId: row.content_id ?? null,
      geometry: row.geometry ? JSON.parse(row.geometry) : null,
      style: row.style ? JSON.parse(row.style) : null,
      orderIndex: row.order_index,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static getListenEvents() {
    return {
      "slider:create-editor": this.createEditor.bind(this),
      "slider:update-editor": this.updateEditor.bind(this),
      "slider:delete-editor": this.deleteEditor.bind(this),
      "slider:get-editors-by-page": this.getEditorsByPage.bind(this),
    };
  }

  static createEditor(
    db: Database.Database,
    block: Omit<SliderEditorBlock, "id" | "createTime" | "updateTime">,
  ): SliderEditorBlock {
    const stmt = db.prepare(`
      INSERT INTO slider_editor_blocks (page_id, kind, content_id, geometry, style, order_index, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      block.pageId,
      block.kind,
      block.contentId ?? null,
      block.geometry ? JSON.stringify(block.geometry) : null,
      block.style ? JSON.stringify(block.style) : null,
      block.orderIndex ?? 0,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "slider-editor", "insert", id, now);
    return this.getEditorById(db, id);
  }

  static updateEditor(
    db: Database.Database,
    block: Partial<Omit<SliderEditorBlock, "createTime" | "updateTime">> & {
      id: number;
    },
  ): SliderEditorBlock {
    const current = this.getEditorById(db, block.id);
    const stmt = db.prepare(`
      UPDATE slider_editor_blocks
      SET page_id = ?, kind = ?, content_id = ?, geometry = ?, style = ?, order_index = ?, update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      block.pageId ?? current.pageId,
      block.kind ?? current.kind,
      block.contentId ?? current.contentId,
      block.geometry
        ? JSON.stringify(block.geometry)
        : current.geometry
          ? JSON.stringify(current.geometry)
          : null,
      block.style
        ? JSON.stringify(block.style)
        : current.style
          ? JSON.stringify(current.style)
          : null,
      block.orderIndex ?? current.orderIndex,
      now,
      block.id,
    );
    Operation.insertOperation(db, "slider-editor", "update", block.id, now);
    return this.getEditorById(db, block.id);
  }

  static deleteEditor(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM slider_editor_blocks WHERE id = ?");
    Operation.insertOperation(db, "slider-editor", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getEditorById(db: Database.Database, id: number): SliderEditorBlock {
    const stmt = db.prepare("SELECT * FROM slider_editor_blocks WHERE id = ?");
    const row = stmt.get(id);
    if (!row) throw new Error(`SliderEditorBlock with id ${id} not found`);
    return this.parse(row);
  }

  static getEditorsByPage(
    db: Database.Database,
    pageId: number,
  ): SliderEditorBlock[] {
    const stmt = db.prepare(
      "SELECT * FROM slider_editor_blocks WHERE page_id = ? ORDER BY order_index ASC, id ASC",
    );
    const rows = stmt.all(pageId);
    return rows.map((r) => this.parse(r));
  }
}
