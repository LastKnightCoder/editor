import Database from "better-sqlite3";
import { Descendant } from "slate";
import {
  CreateSlidePage,
  SlideDeckMetadata,
  SlidePage,
  SlideStorageMode,
  TransitionConfig,
  UpdateSlidePage,
} from "@/types/slide";
import ContentTable from "./content";
import Operation from "./operation";

export default class SlidePageTable {
  static getListenEvents() {
    return {
      "slide-page:create": this.createSlidePage.bind(this),
      "slide-page:update": this.updateSlidePage.bind(this),
      "slide-page:delete": this.deleteSlidePage.bind(this),
      "slide-page:get": this.getSlidePageById.bind(this),
      "slide-page:get-by-deck": this.getSlidePagesByDeck.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS slide_pages (
        id INTEGER PRIMARY KEY,
        deck_id INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        page_index INTEGER NOT NULL,
        content_id INTEGER,
        embedded_content TEXT,
        speaker_notes_content_id INTEGER,
        embedded_speaker_notes TEXT,
        background TEXT,
        style_override TEXT,
        clicks_config TEXT,
        animations TEXT,
        transition_config TEXT,
        version TEXT,
        thumbnail TEXT,
        deleted INTEGER DEFAULT 0,
        FOREIGN KEY (deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE
      )
    `;
    db.exec(createTableSql);

    const indexSql = `
      CREATE INDEX IF NOT EXISTS idx_slide_pages_deck_id ON slide_pages(deck_id);
      CREATE INDEX IF NOT EXISTS idx_slide_pages_deleted ON slide_pages(deleted);
    `;
    db.exec(indexSql);
  }

  static upgradeTable(db: Database.Database) {
    const tableInfo = db
      .prepare(`PRAGMA table_info(slide_pages)`)
      .all() as Array<{
      name: string;
    }>;

    const columns: Record<string, string> = {
      embedded_content:
        "ALTER TABLE slide_pages ADD COLUMN embedded_content TEXT",
      embedded_speaker_notes:
        "ALTER TABLE slide_pages ADD COLUMN embedded_speaker_notes TEXT",
      background: "ALTER TABLE slide_pages ADD COLUMN background TEXT",
      style_override: "ALTER TABLE slide_pages ADD COLUMN style_override TEXT",
      clicks_config: "ALTER TABLE slide_pages ADD COLUMN clicks_config TEXT",
      animations: "ALTER TABLE slide_pages ADD COLUMN animations TEXT",
      transition_config:
        "ALTER TABLE slide_pages ADD COLUMN transition_config TEXT",
      version: "ALTER TABLE slide_pages ADD COLUMN version TEXT",
      thumbnail: "ALTER TABLE slide_pages ADD COLUMN thumbnail TEXT",
      deleted: "ALTER TABLE slide_pages ADD COLUMN deleted INTEGER DEFAULT 0",
    };

    Object.entries(columns).forEach(([column, sql]) => {
      const exists = tableInfo.some((info) => info.name === column);
      if (!exists) {
        db.exec(sql);
      }
    });
  }

  private static getDeckMetadata(
    db: Database.Database,
    deckId: number,
  ): SlideDeckMetadata {
    const stmt = db.prepare(
      "SELECT metadata FROM slide_decks WHERE id = ? AND deleted = 0",
    );
    const row = stmt.get(deckId) as { metadata?: string } | undefined;
    if (!row) {
      throw new Error(`Slide deck ${deckId} not found`);
    }
    let metadata: SlideDeckMetadata = {
      storageMode: "reference",
    };
    if (row.metadata) {
      try {
        const parsed = JSON.parse(row.metadata);
        metadata = {
          storageMode: parsed.storageMode || "reference",
          ...parsed,
        };
      } catch {
        // ignore parse error and keep defaults
      }
    }
    return metadata;
  }

  private static ensureDeckExists(db: Database.Database, deckId: number) {
    const stmt = db.prepare(
      "SELECT id FROM slide_decks WHERE id = ? AND deleted = 0",
    );
    const deck = stmt.get(deckId);
    if (!deck) {
      throw new Error(`Slide deck ${deckId} not found`);
    }
  }

  private static parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private static parseDescendants(value: string | null): Descendant[] {
    return this.parseJson<Descendant[]>(value, []);
  }

  private static parseTransition(
    value: string | null,
  ): TransitionConfig | undefined {
    return this.parseJson<TransitionConfig | undefined>(value, undefined);
  }

  private static parsePageRow(db: Database.Database, row: any): SlidePage {
    const content =
      row.content_id && !row.embedded_content
        ? ContentTable.getContentById(db, row.content_id)?.content
        : undefined;
    const speakerNotes =
      row.speaker_notes_content_id && !row.embedded_speaker_notes
        ? ContentTable.getContentById(db, row.speaker_notes_content_id)?.content
        : undefined;

    const embeddedContent =
      !content && row.embedded_content
        ? this.parseDescendants(row.embedded_content)
        : undefined;
    const embeddedNotes =
      !speakerNotes && row.embedded_speaker_notes
        ? this.parseDescendants(row.embedded_speaker_notes)
        : undefined;

    return {
      id: row.id,
      deckId: row.deck_id,
      createTime: row.create_time,
      updateTime: row.update_time,
      pageIndex: row.page_index,
      contentId: row.content_id || undefined,
      content: content || embeddedContent,
      speakerNotesContentId: row.speaker_notes_content_id || undefined,
      speakerNotes: speakerNotes || embeddedNotes,
      background: row.background
        ? this.parseJson(row.background, undefined)
        : undefined,
      styleOverride: row.style_override
        ? this.parseJson(row.style_override, undefined)
        : undefined,
      transitionConfig: this.parseTransition(row.transition_config),
      version: row.version || undefined,
      thumbnail: row.thumbnail || undefined,
      deleted: Boolean(row.deleted),
    };
  }

  private static persistContent(
    db: Database.Database,
    storageMode: SlideStorageMode,
    node?: Descendant[],
  ): { contentId?: number; embedded?: string | null } {
    const safeNode = node ?? [];
    if (storageMode === "embedded") {
      return {
        embedded: JSON.stringify(safeNode),
      };
    }
    const contentId = ContentTable.createContent(db, {
      content: safeNode,
    });
    return { contentId };
  }

  private static replaceContent(
    db: Database.Database,
    storageMode: SlideStorageMode,
    existingContentId: number | null,
    node?: Descendant[],
  ): { contentId?: number; embedded?: string | null } | undefined {
    if (node === undefined) return undefined;
    if (storageMode === "embedded") {
      return {
        embedded: JSON.stringify(node ?? []),
      };
    }

    const newContentId = ContentTable.createContent(db, {
      content: node ?? [],
    });
    if (existingContentId) {
      ContentTable.deleteContent(db, existingContentId);
    }
    return { contentId: newContentId };
  }

  private static cleanupContentReferences(db: Database.Database, row: any) {
    if (row.content_id) {
      ContentTable.deleteContent(db, row.content_id);
    }
    if (row.speaker_notes_content_id) {
      ContentTable.deleteContent(db, row.speaker_notes_content_id);
    }
  }

  private static rebuildDeckPageIds(db: Database.Database, deckId: number) {
    const stmt = db.prepare(
      "SELECT id FROM slide_pages WHERE deck_id = ? AND deleted = 0 ORDER BY page_index ASC",
    );
    const pages = stmt.all(deckId) as Array<{ id: number }>;
    const ids = pages.map((page) => page.id);
    const now = Date.now();
    db.prepare(
      "UPDATE slide_decks SET page_ids = ?, update_time = ? WHERE id = ?",
    ).run(JSON.stringify(ids), now, deckId);
  }

  private static getPageRow(
    db: Database.Database,
    id: number,
  ): any | undefined {
    const stmt = db.prepare(
      "SELECT * FROM slide_pages WHERE id = ? AND deleted = 0",
    );
    return stmt.get(id);
  }

  private static getNextPageIndex(
    db: Database.Database,
    deckId: number,
  ): number {
    const stmt = db.prepare(
      "SELECT MAX(page_index) as maxIndex FROM slide_pages WHERE deck_id = ? AND deleted = 0",
    );
    const result = stmt.get(deckId) as { maxIndex?: number } | undefined;
    return typeof result?.maxIndex === "number" ? result.maxIndex + 1 : 0;
  }

  static createSlidePage(
    db: Database.Database,
    payload: CreateSlidePage,
  ): SlidePage {
    this.ensureDeckExists(db, payload.deckId);
    const metadata = this.getDeckMetadata(db, payload.deckId);
    const storageMode: SlideStorageMode = metadata.storageMode || "reference";
    const now = Date.now();

    const contentResult = this.persistContent(db, storageMode, payload.content);
    const notesResult = this.persistContent(
      db,
      storageMode,
      payload.speakerNotes,
    );

    const pageIndex =
      typeof payload.pageIndex === "number"
        ? payload.pageIndex
        : this.getNextPageIndex(db, payload.deckId);

    const stmt = db.prepare(`
      INSERT INTO slide_pages (
        deck_id,
        create_time,
        update_time,
        page_index,
        content_id,
        embedded_content,
        speaker_notes_content_id,
        embedded_speaker_notes,
        background,
        style_override,
        transition_config,
        version,
        thumbnail,
        deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const res = stmt.run(
      payload.deckId,
      now,
      now,
      pageIndex,
      contentResult.contentId ?? null,
      contentResult.embedded ?? null,
      notesResult.contentId ?? null,
      notesResult.embedded ?? null,
      payload.background ? JSON.stringify(payload.background) : null,
      payload.styleOverride ? JSON.stringify(payload.styleOverride) : null,
      payload.transitionConfig
        ? JSON.stringify(payload.transitionConfig)
        : null,
      payload.version ?? null,
      payload.thumbnail ?? null,
    );

    const pageId = Number(res.lastInsertRowid);
    this.rebuildDeckPageIds(db, payload.deckId);
    Operation.insertOperation(db, "slide-page", "insert", pageId, now);
    return this.getSlidePageById(db, pageId);
  }

  static updateSlidePage(
    db: Database.Database,
    payload: UpdateSlidePage,
  ): SlidePage {
    const existing = this.getPageRow(db, payload.id);
    if (!existing) {
      throw new Error(`Slide page ${payload.id} not found`);
    }

    const metadata = this.getDeckMetadata(db, existing.deck_id);
    const storageMode: SlideStorageMode = metadata.storageMode || "reference";

    const now = Date.now();
    const updates: string[] = [];
    const params: any[] = [];

    const contentUpdate = this.replaceContent(
      db,
      storageMode,
      existing.content_id || null,
      payload.content,
    );
    if (contentUpdate) {
      updates.push("content_id = ?", "embedded_content = ?");
      params.push(contentUpdate.contentId ?? null);
      params.push(contentUpdate.embedded ?? null);
    }

    const notesUpdate = this.replaceContent(
      db,
      storageMode,
      existing.speaker_notes_content_id || null,
      payload.speakerNotes,
    );
    if (notesUpdate) {
      updates.push(
        "speaker_notes_content_id = ?",
        "embedded_speaker_notes = ?",
      );
      params.push(notesUpdate.contentId ?? null);
      params.push(notesUpdate.embedded ?? null);
    }

    if (payload.background !== undefined) {
      updates.push("background = ?");
      params.push(
        payload.background ? JSON.stringify(payload.background) : null,
      );
    }

    if (payload.styleOverride !== undefined) {
      updates.push("style_override = ?");
      params.push(
        payload.styleOverride ? JSON.stringify(payload.styleOverride) : null,
      );
    }

    if (payload.transitionConfig !== undefined) {
      updates.push("transition_config = ?");
      params.push(
        payload.transitionConfig
          ? JSON.stringify(payload.transitionConfig)
          : null,
      );
    }

    if (payload.version !== undefined) {
      updates.push("version = ?");
      params.push(payload.version ?? null);
    }

    if (payload.thumbnail !== undefined) {
      updates.push("thumbnail = ?");
      params.push(payload.thumbnail ?? null);
    }

    if (typeof payload.pageIndex === "number") {
      updates.push("page_index = ?");
      params.push(payload.pageIndex);
    }

    if (payload.deleted !== undefined) {
      updates.push("deleted = ?");
      params.push(Number(payload.deleted));
    }

    if (updates.length === 0) {
      return this.getSlidePageById(db, payload.id);
    }

    updates.push("update_time = ?");
    params.push(now);
    params.push(payload.id);

    db.prepare(`UPDATE slide_pages SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params,
    );

    if (
      typeof payload.pageIndex === "number" ||
      payload.deleted !== undefined
    ) {
      this.rebuildDeckPageIds(db, existing.deck_id);
    }

    Operation.insertOperation(db, "slide-page", "update", payload.id, now);
    return this.getSlidePageById(db, payload.id);
  }

  static deleteSlidePage(db: Database.Database, id: number): number {
    const existing = this.getPageRow(db, id);
    if (!existing) {
      return 0;
    }
    this.cleanupContentReferences(db, existing);
    const now = Date.now();
    const stmt = db.prepare(
      "UPDATE slide_pages SET deleted = 1, update_time = ? WHERE id = ?",
    );
    const res = stmt.run(now, id);
    this.rebuildDeckPageIds(db, existing.deck_id);
    Operation.insertOperation(db, "slide-page", "delete", id, now);
    return res.changes;
  }

  static softDeletePagesByDeck(db: Database.Database, deckId: number) {
    const rows = db
      .prepare("SELECT * FROM slide_pages WHERE deck_id = ? AND deleted = 0")
      .all(deckId);
    rows.forEach((row) => this.cleanupContentReferences(db, row));
    const now = Date.now();
    db.prepare(
      "UPDATE slide_pages SET deleted = 1, update_time = ? WHERE deck_id = ?",
    ).run(now, deckId);
    this.rebuildDeckPageIds(db, deckId);
  }

  static getSlidePageById(db: Database.Database, id: number): SlidePage {
    const stmt = db.prepare(
      "SELECT * FROM slide_pages WHERE id = ? AND deleted = 0",
    );
    const row = stmt.get(id);
    if (!row) {
      throw new Error(`Slide page ${id} not found`);
    }
    return this.parsePageRow(db, row);
  }

  static getSlidePagesByDeck(
    db: Database.Database,
    deckId: number,
  ): SlidePage[] {
    const stmt = db.prepare(
      "SELECT * FROM slide_pages WHERE deck_id = ? AND deleted = 0 ORDER BY page_index ASC",
    );
    const rows = stmt.all(deckId);
    return rows.map((row) => this.parsePageRow(db, row));
  }
}
