import Database from "better-sqlite3";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import { basename, join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import log from "electron-log";
import type {
  PdfDocumentMap,
  PdfIndexStatus,
  PdfOutlineNode,
  PdfPageContent,
  PdfSectionDetail,
  PdfSectionNode,
} from "@/types";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import PathUtil from "../utils/PathUtil";
import {
  ensureIndexDbDir,
  getIndexDbDir,
  migrateDbFileWithSidecars,
  normalizeMainDbBase,
  scanLegacyDbFiles,
} from "./utils/index-db-storage";

const jieba = Jieba.withDict(dict);
const DEFAULT_VEC_DIMENSIONS = 3072;
const META_STATE_KEY = "state";
const META_PAGE_COUNT_KEY = "page_count";
const META_UPDATED_AT_KEY = "updated_at";
const META_FINGERPRINT_KEY = "fingerprint";
const META_ERROR_KEY = "error";
const META_EMBEDDING_FINGERPRINT_KEY = "embedding_fingerprint";
const META_VEC_DIMENSIONS_KEY = "vec_dimensions";

export interface PdfIndexChunkRecord {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
}

export interface PdfVecSearchResult extends PdfIndexChunkRecord {
  distance: number;
}

export interface PdfSectionRecord {
  id: string;
  parentId: string | null;
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  orderIndex: number;
  pathTitles: string[];
  source: "outline" | "inferred" | "synthetic";
}

interface PersistPdfIndexParams {
  fingerprint: string;
  pageCount: number;
  pages: PdfPageContent[];
  chunks: PdfIndexChunkRecord[];
  outline: PdfOutlineNode[];
  sections: PdfSectionRecord[];
  embeddings?: number[][];
  vecDimensions?: number;
  embeddingFingerprint?: string;
}

const flattenOutline = (
  nodes: PdfOutlineNode[],
  parentId: string | null = null,
): Array<{
  id: string;
  parentId: string | null;
  title: string;
  pageNumber: number | null;
  orderIndex: number;
}> => {
  const result: Array<{
    id: string;
    parentId: string | null;
    title: string;
    pageNumber: number | null;
    orderIndex: number;
  }> = [];

  nodes.forEach((node, index) => {
    result.push({
      id: node.id,
      parentId,
      title: node.title,
      pageNumber: node.pageNumber,
      orderIndex: index,
    });
    result.push(...flattenOutline(node.children, node.id));
  });

  return result;
};

const stringifyJson = (value: unknown): string => JSON.stringify(value ?? null);

const parseJsonArray = (value: unknown): string[] => {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

class PdfIndexDBManager {
  private databases: Map<string, Database.Database> = new Map();
  private legacyScanCompleted = false;

  private getDatabaseKey(mainDbName: string, pdfId: number): string {
    return `${normalizeMainDbBase(mainDbName)}-pdf-${pdfId}`;
  }

  private getDatabasePath(mainDbName: string, pdfId: number): string {
    const indexDir = getIndexDbDir(mainDbName);
    return join(indexDir, `${this.getDatabaseKey(mainDbName, pdfId)}.db`);
  }

  private getLegacyDatabasePath(mainDbName: string, pdfId: number): string {
    return join(
      PathUtil.getAppDir(),
      `${this.getDatabaseKey(mainDbName, pdfId)}.db`,
    );
  }

  private migrateLegacyDatabase(mainDbName: string, pdfId: number): void {
    const legacyPath = this.getLegacyDatabasePath(mainDbName, pdfId);
    const targetPath = this.getDatabasePath(mainDbName, pdfId);
    try {
      const result = migrateDbFileWithSidecars(legacyPath, targetPath);
      if (result.reason === "source_not_found") {
        return;
      }
      log.info(
        `[PdfIndexDB] migrate legacy file: source=${result.source}, target=${result.target}, moved=${result.moved}, skipped=${result.skipped}, reason=${result.reason}`,
      );
    } catch (error) {
      log.warn(
        `[PdfIndexDB] migrate legacy file failed: source=${legacyPath}, target=${targetPath}, error=${error}`,
      );
    }
  }

  private scanAndMigrateLegacyDatabases(): void {
    if (this.legacyScanCompleted) {
      return;
    }
    this.legacyScanCompleted = true;

    let found = 0;
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const { files } = scanLegacyDbFiles((fileName) =>
        /-pdf-\d+\.db$/i.test(fileName),
      );
      found = files.length;
      for (const legacyPath of files) {
        const fileName = basename(legacyPath);
        const matched = fileName.match(/^(.*)-pdf-(\d+)\.db$/i);
        if (!matched) {
          skipped += 1;
          continue;
        }
        const mainDbName = `${matched[1]}.db`;
        const pdfId = Number.parseInt(matched[2], 10);
        if (!Number.isFinite(pdfId)) {
          skipped += 1;
          continue;
        }
        const targetPath = this.getDatabasePath(mainDbName, pdfId);
        try {
          const result = migrateDbFileWithSidecars(legacyPath, targetPath);
          if (result.moved) {
            migrated += 1;
          } else {
            skipped += 1;
          }
        } catch (error) {
          failed += 1;
          log.warn(
            `[PdfIndexDB] startup migration failed: source=${legacyPath}, target=${targetPath}, error=${error}`,
          );
        }
      }
    } catch (error) {
      failed += 1;
      log.warn(`[PdfIndexDB] startup migration scan failed: ${error}`);
    }

    log.info(
      `[PdfIndexDB] startup migration summary: found=${found}, migrated=${migrated}, skipped=${skipped}, failed=${failed}`,
    );
  }

  getDatabase(mainDbName: string, pdfId: number): Database.Database {
    this.scanAndMigrateLegacyDatabases();
    this.migrateLegacyDatabase(mainDbName, pdfId);
    ensureIndexDbDir(mainDbName);

    const key = this.getDatabaseKey(mainDbName, pdfId);
    const existing = this.databases.get(key);
    if (existing) {
      return existing;
    }

    const db = new Database(this.getDatabasePath(mainDbName, pdfId));
    loadSqliteVecExtension(db);
    db.pragma("journal_mode = WAL");
    this.initTables(db);
    this.cleanTables(db);
    this.databases.set(key, db);
    return db;
  }

  private initTables(
    db: Database.Database,
    vecDimensions = DEFAULT_VEC_DIMENSIONS,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS pdf_pages (
        page_number INTEGER PRIMARY KEY,
        content TEXT NOT NULL,
        char_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pdf_outline_nodes (
        node_id TEXT PRIMARY KEY,
        parent_node_id TEXT,
        title TEXT NOT NULL,
        page_number INTEGER,
        order_index INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pdf_sections (
        section_id TEXT PRIMARY KEY,
        parent_section_id TEXT,
        title TEXT NOT NULL,
        level INTEGER NOT NULL,
        start_page INTEGER NOT NULL,
        end_page INTEGER NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        path_titles TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'outline'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS pdf_chunks_fts USING fts5(
        page_number UNINDEXED,
        chunk_index UNINDEXED,
        char_start UNINDEXED,
        char_end UNINDEXED,
        content,
        search_content,
        tokenize='unicode61'
      );
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_pdf_sections_page_range ON pdf_sections(start_page, end_page)",
    );
    this.initVecTable(db, vecDimensions);
  }

  private initVecTable(
    db: Database.Database,
    vecDimensions = DEFAULT_VEC_DIMENSIONS,
  ) {
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_chunks_vec'",
      )
      .get();
    if (tableExists) {
      return;
    }
    db.exec(`
      CREATE VIRTUAL TABLE pdf_chunks_vec USING vec0(
        page_number INTEGER,
        chunk_index INTEGER,
        char_start INTEGER,
        char_end INTEGER,
        content TEXT,
        vec_embedding FLOAT[${vecDimensions}] distance_metric=cosine
      )
    `);
  }

  private setMeta(db: Database.Database, key: string, value: string | null) {
    db.prepare(
      `
        INSERT INTO pdf_index_meta(key, value, updated_at)
        VALUES(?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
      `,
    ).run(key, value, Date.now());
  }

  private getMeta(db: Database.Database, key: string): string | null {
    const row = db
      .prepare("SELECT value FROM pdf_index_meta WHERE key = ?")
      .get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  private cleanTables(db: Database.Database) {
    db.exec(`
      DROP TABLE IF EXISTS pdf_section_summaries;
      DROP TABLE IF EXISTS pdf_document_summary;
      DROP TABLE IF EXISTS pdf_section_fts;
      DROP TABLE IF EXISTS pdf_section_vec;
    `);
  }

  private clearData(db: Database.Database) {
    db.prepare("DELETE FROM pdf_pages").run();
    db.prepare("DELETE FROM pdf_outline_nodes").run();
    db.prepare("DELETE FROM pdf_sections").run();
    this.cleanTables(db);
    if (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_chunks_fts'",
        )
        .get()
    ) {
      db.prepare("DELETE FROM pdf_chunks_fts").run();
    }
    if (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_chunks_vec'",
        )
        .get()
    ) {
      db.exec("DROP TABLE IF EXISTS pdf_chunks_vec");
    }
  }

  setIndexState(
    mainDbName: string,
    pdfId: number,
    state: PdfIndexStatus["state"],
    extras?: {
      fingerprint?: string;
      pageCount?: number;
      error?: string | null;
      embeddingFingerprint?: string | null;
    },
  ): PdfIndexStatus {
    const db = this.getDatabase(mainDbName, pdfId);
    this.setMeta(db, META_STATE_KEY, state);
    this.setMeta(db, META_UPDATED_AT_KEY, String(Date.now()));
    if (extras?.fingerprint !== undefined) {
      this.setMeta(db, META_FINGERPRINT_KEY, extras.fingerprint);
    }
    if (extras?.pageCount !== undefined) {
      this.setMeta(db, META_PAGE_COUNT_KEY, String(extras.pageCount));
    }
    if (extras?.error !== undefined) {
      this.setMeta(db, META_ERROR_KEY, extras.error);
    }
    if (extras?.embeddingFingerprint !== undefined) {
      this.setMeta(
        db,
        META_EMBEDDING_FINGERPRINT_KEY,
        extras.embeddingFingerprint,
      );
    }
    return this.getIndexStatus(mainDbName, pdfId);
  }

  persistIndex(
    mainDbName: string,
    pdfId: number,
    params: PersistPdfIndexParams,
  ): PdfIndexStatus {
    const db = this.getDatabase(mainDbName, pdfId);
    this.initTables(db, params.vecDimensions || DEFAULT_VEC_DIMENSIONS);
    const outlineRows = flattenOutline(params.outline);
    const insertPage = db.prepare(
      "INSERT INTO pdf_pages(page_number, content, char_count) VALUES (?, ?, ?)",
    );
    const insertOutline = db.prepare(
      `INSERT INTO pdf_outline_nodes(node_id, parent_node_id, title, page_number, order_index)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const insertSection = db.prepare(
      `INSERT INTO pdf_sections(
        section_id,
        parent_section_id,
        title,
        level,
        start_page,
        end_page,
        order_index,
        path_titles,
        source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertFts = db.prepare(
      `INSERT INTO pdf_chunks_fts(page_number, chunk_index, char_start, char_end, content, search_content)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    const tx = db.transaction(() => {
      this.clearData(db);
      this.initTables(db, params.vecDimensions || DEFAULT_VEC_DIMENSIONS);
      for (const page of params.pages) {
        insertPage.run(page.pageNumber, page.content, page.charCount);
      }
      for (const row of outlineRows) {
        insertOutline.run(
          row.id,
          row.parentId,
          row.title,
          row.pageNumber,
          row.orderIndex,
        );
      }
      for (const section of params.sections) {
        insertSection.run(
          section.id,
          section.parentId,
          section.title,
          section.level,
          section.startPage,
          section.endPage,
          section.orderIndex,
          stringifyJson(section.pathTitles),
          section.source,
        );
      }
      for (const chunk of params.chunks) {
        insertFts.run(
          chunk.pageNumber,
          chunk.chunkIndex,
          chunk.charStart,
          chunk.charEnd,
          chunk.content,
          this.segmentText(chunk.content),
        );
      }

      if (params.embeddings?.length && params.vecDimensions) {
        this.initVecTable(db, params.vecDimensions);
        const insertVec = db.prepare(
          `INSERT INTO pdf_chunks_vec(page_number, chunk_index, char_start, char_end, content, vec_embedding)
           VALUES (?, ?, ?, ?, ?, vec_f32(?))`,
        );
        params.chunks.forEach((chunk, index) => {
          insertVec.run(
            BigInt(Math.floor(chunk.pageNumber)),
            BigInt(Math.floor(chunk.chunkIndex)),
            BigInt(Math.floor(chunk.charStart)),
            BigInt(Math.floor(chunk.charEnd)),
            chunk.content,
            JSON.stringify(params.embeddings?.[index] || []),
          );
        });
      }

      this.setMeta(db, META_FINGERPRINT_KEY, params.fingerprint);
      this.setMeta(db, META_PAGE_COUNT_KEY, String(params.pageCount));
      this.setMeta(db, META_UPDATED_AT_KEY, String(Date.now()));
      this.setMeta(db, META_ERROR_KEY, null);
      this.setMeta(db, META_STATE_KEY, "ready");
      this.setMeta(
        db,
        META_EMBEDDING_FINGERPRINT_KEY,
        params.embeddingFingerprint || null,
      );
      this.setMeta(
        db,
        META_VEC_DIMENSIONS_KEY,
        params.vecDimensions ? String(params.vecDimensions) : null,
      );
    });

    tx();
    return this.getIndexStatus(mainDbName, pdfId);
  }

  getIndexStatus(mainDbName: string, pdfId: number): PdfIndexStatus {
    const db = this.getDatabase(mainDbName, pdfId);
    const state = (this.getMeta(db, META_STATE_KEY) ||
      "pending") as PdfIndexStatus["state"];
    const pageCount = Number(this.getMeta(db, META_PAGE_COUNT_KEY) || 0);
    const updatedAtRaw = this.getMeta(db, META_UPDATED_AT_KEY);
    return {
      pdfId,
      state,
      pageCount: Number.isFinite(pageCount) ? pageCount : 0,
      updatedAt: updatedAtRaw ? Number(updatedAtRaw) : null,
      fingerprint: this.getMeta(db, META_FINGERPRINT_KEY) || undefined,
      error: this.getMeta(db, META_ERROR_KEY) || undefined,
      partial: state === "building",
    };
  }

  getEmbeddingFingerprint(mainDbName: string, pdfId: number): string | null {
    return this.getMeta(
      this.getDatabase(mainDbName, pdfId),
      META_EMBEDDING_FINGERPRINT_KEY,
    );
  }

  getVectorDimensions(mainDbName: string, pdfId: number): number | null {
    const raw = this.getMeta(
      this.getDatabase(mainDbName, pdfId),
      META_VEC_DIMENSIONS_KEY,
    );
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  segmentText(text: string): string {
    if (!text.trim()) {
      return "";
    }
    return jieba.cutForSearch(text, true).join(" ");
  }

  private getSectionById(
    db: Database.Database,
    sectionId: string,
  ): Omit<PdfSectionNode, "children"> | null {
    const row = db
      .prepare(
        `SELECT
          section_id,
          parent_section_id,
          title,
          level,
          start_page,
          end_page,
          order_index,
          path_titles,
          source
         FROM pdf_sections
         WHERE section_id = ?`,
      )
      .get(sectionId) as
      | {
          section_id: string;
          parent_section_id: string | null;
          title: string;
          level: number;
          start_page: number;
          end_page: number;
          order_index: number;
          path_titles: string;
          source: "outline" | "inferred" | "synthetic";
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.section_id,
      parentId: row.parent_section_id,
      title: row.title,
      level: row.level,
      startPage: row.start_page,
      endPage: row.end_page,
      orderIndex: row.order_index,
      pathTitles: parseJsonArray(row.path_titles),
      source: row.source || "outline",
    };
  }

  private getSectionContextByPage(
    db: Database.Database,
    pageNumber: number,
  ): {
    sectionId: string;
    title: string;
    pathTitles: string[];
    startPage: number;
    endPage: number;
  } | null {
    const row = db
      .prepare(
        `SELECT section_id, title, path_titles, start_page, end_page
         FROM pdf_sections
         WHERE start_page <= ? AND end_page >= ?
         ORDER BY level DESC, start_page ASC
         LIMIT 1`,
      )
      .get(pageNumber, pageNumber) as
      | {
          section_id: string;
          title: string;
          path_titles: string;
          start_page: number;
          end_page: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      sectionId: row.section_id,
      title: row.title,
      pathTitles: parseJsonArray(row.path_titles),
      startPage: row.start_page,
      endPage: row.end_page,
    };
  }

  searchFTS(
    mainDbName: string,
    pdfId: number,
    query: string,
    limit: number,
  ): Array<
    PdfIndexChunkRecord & {
      rank?: number;
      sectionId?: string;
      sectionTitle?: string;
      sectionPath?: string[];
      sectionStartPage?: number;
      sectionEndPage?: number;
    }
  > {
    const db = this.getDatabase(mainDbName, pdfId);
    const segmented = this.segmentText(query.trim());
    if (!segmented) {
      return [];
    }
    const rows = db
      .prepare(
        `
          SELECT page_number, chunk_index, char_start, char_end, content, bm25(pdf_chunks_fts) AS rank
          FROM pdf_chunks_fts
          WHERE search_content MATCH ?
          ORDER BY rank
          LIMIT ?
        `,
      )
      .all(segmented, Math.max(1, limit)) as Array<{
      page_number: number;
      chunk_index: number;
      char_start: number;
      char_end: number;
      content: string;
      rank?: number;
    }>;

    return rows.map((row) => {
      const section = this.getSectionContextByPage(db, row.page_number);
      return {
        pageNumber: row.page_number,
        chunkIndex: row.chunk_index,
        charStart: row.char_start,
        charEnd: row.char_end,
        content: row.content,
        rank: row.rank,
        sectionId: section?.sectionId,
        sectionTitle: section?.title,
        sectionPath: section?.pathTitles,
        sectionStartPage: section?.startPage,
        sectionEndPage: section?.endPage,
      };
    });
  }

  searchVec(
    mainDbName: string,
    pdfId: number,
    queryEmbedding: number[],
    limit: number,
    distance: number,
  ): Array<
    PdfVecSearchResult & {
      sectionId?: string;
      sectionTitle?: string;
      sectionPath?: string[];
      sectionStartPage?: number;
      sectionEndPage?: number;
    }
  > {
    const db = this.getDatabase(mainDbName, pdfId);
    const hasTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pdf_chunks_vec'",
      )
      .get();
    if (!hasTable) {
      return [];
    }

    const rows = db
      .prepare(
        `
          SELECT page_number, chunk_index, char_start, char_end, content, distance
          FROM pdf_chunks_vec
          WHERE distance < ? AND vec_embedding MATCH ? AND k = ?
          ORDER BY distance
        `,
      )
      .all(
        distance,
        JSON.stringify(queryEmbedding),
        BigInt(Math.max(1, limit)),
      ) as Array<{
      page_number: number;
      chunk_index: number;
      char_start: number;
      char_end: number;
      content: string;
      distance: number;
    }>;

    return rows.map((row) => {
      const section = this.getSectionContextByPage(db, row.page_number);
      return {
        pageNumber: row.page_number,
        chunkIndex: row.chunk_index,
        charStart: row.char_start,
        charEnd: row.char_end,
        content: row.content,
        distance: row.distance,
        sectionId: section?.sectionId,
        sectionTitle: section?.title,
        sectionPath: section?.pathTitles,
        sectionStartPage: section?.startPage,
        sectionEndPage: section?.endPage,
      };
    });
  }

  getPageContent(
    mainDbName: string,
    pdfId: number,
    pageNumber: number,
  ): PdfPageContent | null {
    const db = this.getDatabase(mainDbName, pdfId);
    const row = db
      .prepare(
        "SELECT page_number, content, char_count FROM pdf_pages WHERE page_number = ?",
      )
      .get(pageNumber) as
      | { page_number: number; content: string; char_count: number }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      pdfId,
      pageNumber: row.page_number,
      content: row.content,
      charCount: row.char_count,
    };
  }

  getPageRangeContent(
    mainDbName: string,
    pdfId: number,
    startPage: number,
    endPage: number,
  ): PdfPageContent[] {
    const db = this.getDatabase(mainDbName, pdfId);
    const rows = db
      .prepare(
        `SELECT page_number, content, char_count
         FROM pdf_pages
         WHERE page_number BETWEEN ? AND ?
         ORDER BY page_number ASC`,
      )
      .all(startPage, endPage) as Array<{
      page_number: number;
      content: string;
      char_count: number;
    }>;
    return rows.map((row) => ({
      pdfId,
      pageNumber: row.page_number,
      content: row.content,
      charCount: row.char_count,
    }));
  }

  getOutline(mainDbName: string, pdfId: number): PdfOutlineNode[] {
    const db = this.getDatabase(mainDbName, pdfId);
    const rows = db
      .prepare(
        `SELECT node_id, parent_node_id, title, page_number, order_index
         FROM pdf_outline_nodes
         ORDER BY parent_node_id ASC, order_index ASC`,
      )
      .all() as Array<{
      node_id: string;
      parent_node_id: string | null;
      title: string;
      page_number: number | null;
      order_index: number;
    }>;

    const nodeMap = new Map<string, PdfOutlineNode>();
    const roots: Array<
      PdfOutlineNode & { __parent: string | null; __order: number }
    > = [];

    rows.forEach((row) => {
      const node = {
        id: row.node_id,
        title: row.title,
        pageNumber: row.page_number,
        orderIndex: row.order_index,
        children: [],
        __parent: row.parent_node_id,
        __order: row.order_index,
      };
      nodeMap.set(row.node_id, node);
      roots.push(node);
    });

    const result: PdfOutlineNode[] = [];
    roots.forEach((node) => {
      const parentId = (node as typeof node & { __parent: string | null })
        .__parent;
      if (parentId) {
        const parent = nodeMap.get(parentId);
        parent?.children.push(node);
      } else {
        result.push(node);
      }
    });

    const sortNodes = (nodes: PdfOutlineNode[]) => {
      nodes.sort((a, b) => a.orderIndex - b.orderIndex);
      nodes.forEach((node) => sortNodes(node.children));
    };
    sortNodes(result);
    return result;
  }

  getSectionTree(
    mainDbName: string,
    pdfId: number,
    depth?: number,
  ): PdfSectionNode[] {
    const db = this.getDatabase(mainDbName, pdfId);
    const rows = db
      .prepare(
        `SELECT
          s.section_id,
          s.parent_section_id,
          s.title,
          s.level,
          s.start_page,
          s.end_page,
          s.order_index,
          s.path_titles,
          s.source AS section_source
         FROM pdf_sections s
         ORDER BY s.level ASC, s.order_index ASC, s.start_page ASC`,
      )
      .all() as Array<{
      section_id: string;
      parent_section_id: string | null;
      title: string;
      level: number;
      start_page: number;
      end_page: number;
      order_index: number;
      path_titles: string;
      section_source: "outline" | "inferred" | "synthetic";
    }>;

    const nodeMap = new Map<string, PdfSectionNode>();
    rows.forEach((row) => {
      nodeMap.set(row.section_id, {
        id: row.section_id,
        parentId: row.parent_section_id,
        title: row.title,
        level: row.level,
        startPage: row.start_page,
        endPage: row.end_page,
        orderIndex: row.order_index,
        pathTitles: parseJsonArray(row.path_titles),
        source: row.section_source || "outline",
        children: [],
      });
    });

    const roots: PdfSectionNode[] = [];
    nodeMap.forEach((node) => {
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        parent?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes: PdfSectionNode[], currentDepth: number) => {
      nodes.sort((a, b) => {
        if (a.startPage !== b.startPage) {
          return a.startPage - b.startPage;
        }
        return a.orderIndex - b.orderIndex;
      });
      nodes.forEach((node) => {
        if (typeof depth === "number" && currentDepth >= depth) {
          node.children = [];
        } else {
          sortNodes(node.children, currentDepth + 1);
        }
      });
    };
    sortNodes(roots, 1);
    return roots;
  }

  getDocumentMap(
    mainDbName: string,
    pdfId: number,
    params: {
      fileName: string;
      depth?: number;
    },
  ): PdfDocumentMap {
    const indexStatus = this.getIndexStatus(mainDbName, pdfId);
    return {
      pdfId,
      fileName: params.fileName,
      pageCount: indexStatus.pageCount,
      indexStatus,
      sections: this.getSectionTree(mainDbName, pdfId, params.depth),
    };
  }

  getSectionDetail(
    mainDbName: string,
    pdfId: number,
    sectionId: string,
  ): PdfSectionDetail | null {
    const db = this.getDatabase(mainDbName, pdfId);
    const sectionInfo = this.getSectionById(db, sectionId);
    if (!sectionInfo) {
      return null;
    }
    const pages = this.getPageRangeContent(
      mainDbName,
      pdfId,
      sectionInfo.startPage,
      sectionInfo.endPage,
    );
    return {
      pdfId,
      sectionInfo,
      breadcrumbs: sectionInfo.pathTitles.map((title, index) => ({
        id: sectionInfo.pathTitles.slice(0, index + 1).join(" / "),
        title,
      })),
      pages,
      content: pages
        .map((page) => page.content)
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  closeAllForMainDB(mainDbName: string): void {
    const prefix = `${normalizeMainDbBase(mainDbName)}-pdf-`;
    for (const [key, db] of this.databases.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      try {
        db.close();
      } catch (error) {
        log.error(`[PdfIndexDB] close failed: ${error}`);
      }
      this.databases.delete(key);
    }
  }

  deleteDatabase(mainDbName: string, pdfId: number): void {
    const key = this.getDatabaseKey(mainDbName, pdfId);
    const db = this.databases.get(key);
    if (db) {
      try {
        db.close();
      } catch (error) {
        log.error(`[PdfIndexDB] close failed: ${error}`);
      }
      this.databases.delete(key);
    }

    const paths = [
      this.getDatabasePath(mainDbName, pdfId),
      this.getLegacyDatabasePath(mainDbName, pdfId),
    ];
    for (const dbPath of paths) {
      try {
        if (existsSync(dbPath)) {
          unlinkSync(dbPath);
        }
        if (existsSync(`${dbPath}-wal`)) {
          unlinkSync(`${dbPath}-wal`);
        }
        if (existsSync(`${dbPath}-shm`)) {
          unlinkSync(`${dbPath}-shm`);
        }
      } catch (error) {
        log.error(`[PdfIndexDB] delete db failed: path=${dbPath}, ${error}`);
      }
    }
  }
}

export default new PdfIndexDBManager();
