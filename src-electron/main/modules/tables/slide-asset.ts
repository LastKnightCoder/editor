import Database from "better-sqlite3";
import { CreateSlideAsset, SlideAsset } from "@/types/slide";

export default class SlideAssetTable {
  static getListenEvents() {
    return {
      "slide-asset:create": this.createAsset.bind(this),
      "slide-asset:delete": this.deleteAsset.bind(this),
      "slide-asset:get-by-deck": this.getAssetsByDeck.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS slide_assets (
        id INTEGER PRIMARY KEY,
        deck_id INTEGER NOT NULL,
        asset_type TEXT NOT NULL,
        asset_url TEXT NOT NULL,
        local_path TEXT,
        create_time INTEGER NOT NULL,
        FOREIGN KEY (deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE
      )
    `;
    db.exec(createTableSql);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_slide_assets_deck_id ON slide_assets(deck_id)",
    );
  }

  static upgradeTable(_db: Database.Database) {
    // no-op for now
  }

  private static parseAsset(row: any): SlideAsset {
    return {
      id: row.id,
      deckId: row.deck_id,
      assetType: row.asset_type,
      assetUrl: row.asset_url,
      localPath: row.local_path || undefined,
      createTime: row.create_time,
    };
  }

  static createAsset(
    db: Database.Database,
    payload: CreateSlideAsset,
  ): SlideAsset {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO slide_assets (deck_id, asset_type, asset_url, local_path, create_time)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      payload.deckId,
      payload.assetType,
      payload.assetUrl,
      payload.localPath ?? null,
      now,
    );
    const assetId = Number(res.lastInsertRowid);
    return this.getAssetById(db, assetId);
  }

  static deleteAsset(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM slide_assets WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getAssetById(db: Database.Database, id: number): SlideAsset {
    const stmt = db.prepare("SELECT * FROM slide_assets WHERE id = ?");
    const row = stmt.get(id);
    if (!row) {
      throw new Error(`Slide asset ${id} not found`);
    }
    return this.parseAsset(row);
  }

  static getAssetsByDeck(db: Database.Database, deckId: number): SlideAsset[] {
    const stmt = db.prepare(
      "SELECT * FROM slide_assets WHERE deck_id = ? ORDER BY create_time DESC",
    );
    const rows = stmt.all(deckId);
    return rows.map((row) => this.parseAsset(row));
  }
}
