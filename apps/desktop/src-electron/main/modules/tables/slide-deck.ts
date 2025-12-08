import Database from "better-sqlite3";
import {
  CreateSlideDeck,
  SlideDeck,
  SlideDeckMetadata,
  UpdateSlideDeck,
} from "@/types/slide";
import Operation from "./operation";
import SlidePageTable from "./slide-page";

export default class SlideDeckTable {
  static getListenEvents() {
    return {
      "slide-deck:create": this.createSlideDeck.bind(this),
      "slide-deck:update": this.updateSlideDeck.bind(this),
      "slide-deck:delete": this.deleteSlideDeck.bind(this),
      "slide-deck:get": this.getSlideDeckById.bind(this),
      "slide-deck:get-all": this.getAllSlideDecks.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS slide_decks (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        tags TEXT,
        width INTEGER NOT NULL DEFAULT 1280,
        height INTEGER NOT NULL DEFAULT 720,
        base_font_scale REAL NOT NULL DEFAULT 1.0,
        theme_id TEXT,
        theme_config TEXT,
        page_ids TEXT,
        metadata TEXT,
        thumbnail TEXT,
        deleted INTEGER DEFAULT 0,
        group_id INTEGER
      )
    `;
    db.exec(createTableSql);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_slide_decks_deleted ON slide_decks(deleted)",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_slide_decks_update_time ON slide_decks(update_time)",
    );
  }

  static upgradeTable(db: Database.Database) {
    const tableInfo = db
      .prepare(`PRAGMA table_info(slide_decks)`)
      .all() as Array<{
      name: string;
    }>;

    const columns: Record<string, string> = {
      description: "ALTER TABLE slide_decks ADD COLUMN description TEXT",
      tags: "ALTER TABLE slide_decks ADD COLUMN tags TEXT",
      width:
        "ALTER TABLE slide_decks ADD COLUMN width INTEGER NOT NULL DEFAULT 1280",
      height:
        "ALTER TABLE slide_decks ADD COLUMN height INTEGER NOT NULL DEFAULT 720",
      base_font_scale:
        "ALTER TABLE slide_decks ADD COLUMN base_font_scale REAL NOT NULL DEFAULT 1.0",
      theme_id: "ALTER TABLE slide_decks ADD COLUMN theme_id TEXT",
      theme_config: "ALTER TABLE slide_decks ADD COLUMN theme_config TEXT",
      page_ids: "ALTER TABLE slide_decks ADD COLUMN page_ids TEXT",
      metadata: "ALTER TABLE slide_decks ADD COLUMN metadata TEXT",
      thumbnail: "ALTER TABLE slide_decks ADD COLUMN thumbnail TEXT",
      deleted: "ALTER TABLE slide_decks ADD COLUMN deleted INTEGER DEFAULT 0",
      group_id: "ALTER TABLE slide_decks ADD COLUMN group_id INTEGER",
    };

    Object.entries(columns).forEach(([column, sql]) => {
      const exists = tableInfo.some((info) => info.name === column);
      if (!exists) {
        db.exec(sql);
      }
    });

    // 在确保 group_id 列存在后创建索引
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_slide_decks_group_id ON slide_decks(group_id)",
    );
  }

  private static ensureMetadata(
    metadata?: Partial<SlideDeckMetadata>,
  ): SlideDeckMetadata {
    return {
      storageMode: metadata?.storageMode ?? "reference",
      ...metadata,
    };
  }

  private static parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private static parseDeck(row: any): SlideDeck {
    return {
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      title: row.title,
      description: row.description || undefined,
      tags: this.parseJson<string[]>(row.tags, []),
      width: row.width || 1280,
      height: row.height || 720,
      baseFontScale: row.base_font_scale || 1,
      themeId: row.theme_id || undefined,
      themeConfig: row.theme_config
        ? this.parseJson(row.theme_config, undefined)
        : undefined,
      pageIds: this.parseJson<number[]>(row.page_ids, []),
      metadata: this.ensureMetadata(
        row.metadata ? this.parseJson(row.metadata, {}) : {},
      ),
      thumbnail: row.thumbnail || undefined,
      deleted: Boolean(row.deleted),
      groupId: row.group_id ?? null,
    };
  }

  static getSlideDeckById(db: Database.Database, id: number): SlideDeck {
    const stmt = db.prepare(
      "SELECT * FROM slide_decks WHERE id = ? AND deleted = 0",
    );
    const row = stmt.get(id);
    if (!row) {
      throw new Error(`Slide deck ${id} not found`);
    }
    return this.parseDeck(row);
  }

  static getAllSlideDecks(db: Database.Database): SlideDeck[] {
    const stmt = db.prepare(
      "SELECT * FROM slide_decks WHERE deleted = 0 ORDER BY update_time DESC",
    );
    const rows = stmt.all();
    return rows.map((row) => this.parseDeck(row));
  }

  static createSlideDeck(
    db: Database.Database,
    payload: CreateSlideDeck,
  ): SlideDeck {
    const now = Date.now();
    const metadata = this.ensureMetadata(payload.metadata);
    const stmt = db.prepare(`
      INSERT INTO slide_decks (
        create_time,
        update_time,
        title,
        description,
        tags,
        width,
        height,
        base_font_scale,
        theme_id,
        theme_config,
        page_ids,
        metadata,
        thumbnail,
        deleted,
        group_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);

    const res = stmt.run(
      now,
      now,
      payload.title,
      payload.description ?? null,
      JSON.stringify(payload.tags ?? []),
      payload.width ?? 1280,
      payload.height ?? 720,
      payload.baseFontScale ?? 1,
      payload.themeId ?? null,
      payload.themeConfig ? JSON.stringify(payload.themeConfig) : null,
      JSON.stringify([]),
      JSON.stringify(metadata),
      payload.thumbnail ?? null,
      payload.groupId ?? null,
    );
    const deckId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "slide-deck", "insert", deckId, now);
    return this.getSlideDeckById(db, deckId);
  }

  static updateSlideDeck(
    db: Database.Database,
    payload: UpdateSlideDeck,
  ): SlideDeck {
    const existingStmt = db.prepare(
      "SELECT * FROM slide_decks WHERE id = ? AND deleted = 0",
    );
    const row = existingStmt.get(payload.id);
    if (!row) {
      throw new Error(`Slide deck ${payload.id} not found`);
    }

    const existing = this.parseDeck(row);
    const metadata = this.ensureMetadata({
      ...existing.metadata,
      ...payload.metadata,
    });

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE slide_decks SET
        update_time = ?,
        title = ?,
        description = ?,
        tags = ?,
        width = ?,
        height = ?,
        base_font_scale = ?,
        theme_id = ?,
        theme_config = ?,
        page_ids = ?,
        metadata = ?,
        thumbnail = ?,
        deleted = ?,
        group_id = ?
      WHERE id = ?
    `);

    stmt.run(
      now,
      payload.title ?? existing.title,
      payload.description ?? existing.description ?? null,
      JSON.stringify(payload.tags ?? existing.tags ?? []),
      payload.width ?? existing.width,
      payload.height ?? existing.height,
      payload.baseFontScale ?? existing.baseFontScale,
      payload.themeId ?? existing.themeId ?? null,
      payload.themeConfig
        ? JSON.stringify(payload.themeConfig)
        : existing.themeConfig
          ? JSON.stringify(existing.themeConfig)
          : null,
      JSON.stringify(payload.pageIds ?? existing.pageIds ?? []),
      JSON.stringify(metadata),
      payload.thumbnail ?? existing.thumbnail ?? null,
      Number(payload.deleted ?? existing.deleted ?? false),
      payload.groupId !== undefined ? payload.groupId : existing.groupId,
      payload.id,
    );

    Operation.insertOperation(db, "slide-deck", "update", payload.id, now);
    return this.getSlideDeckById(db, payload.id);
  }

  static deleteSlideDeck(db: Database.Database, id: number): number {
    const stmt = db.prepare(
      "UPDATE slide_decks SET deleted = 1, update_time = ? WHERE id = ?",
    );
    const now = Date.now();
    const res = stmt.run(now, id);
    SlidePageTable.softDeletePagesByDeck(db, id);
    Operation.insertOperation(db, "slide-deck", "delete", id, now);
    return res.changes;
  }
}
