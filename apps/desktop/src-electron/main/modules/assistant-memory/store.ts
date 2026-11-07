import { createHash } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  AssistantMemory,
  MemoryCorrection,
  MemoryEvidence,
  MemorySearch,
  MemorySource,
  MemorySourceKind,
  PersonalMemoryModel,
} from "@/types/assistant-memory";
import { normalizeMemory, searchTerms, type MemoryCandidate } from "./extraction";
import { loadSqliteVecExtension } from "../../utils/sqlite-vec-loader";
import type { MemoryModelCandidate } from "./reflection";
import type { ReconcileEntry, ReconcileOp } from "./reconcile";
import { MEMORY_INGEST_KINDS } from "@/types/assistant-memory";
import type { MemoryDebugData, MemoryDebugModel } from "@/types/assistant-memory-debug";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, topic TEXT NOT NULL, topic_key TEXT NOT NULL,
  text TEXT NOT NULL, fact_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL, observed_at INTEGER NOT NULL, expires_at INTEGER,
  manual INTEGER NOT NULL DEFAULT 0, touched_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_topic ON memory(topic_key, state, observed_at);
CREATE INDEX IF NOT EXISTS memory_expiry ON memory(expires_at) WHERE state = 'current';
CREATE TABLE IF NOT EXISTS evidence (
  memory_id INTEGER NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, source_id TEXT NOT NULL, anchor TEXT NOT NULL, quote TEXT NOT NULL,
  PRIMARY KEY(memory_id, kind, source_id, anchor, quote)
);
CREATE INDEX IF NOT EXISTS evidence_source ON evidence(kind, source_id);
CREATE TABLE IF NOT EXISTS forgotten_fact (fact_key TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS forgotten_anchor (
  kind TEXT NOT NULL, source_id TEXT NOT NULL, anchor TEXT NOT NULL,
  PRIMARY KEY(kind, source_id, anchor)
);
CREATE TABLE IF NOT EXISTS progress (
  kind TEXT NOT NULL, source_id TEXT NOT NULL,
  checked_at REAL, reading_at REAL, cursor TEXT, checked_cursor TEXT,
  due_at INTEGER, priority INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(kind, source_id)
);
CREATE INDEX IF NOT EXISTS progress_due ON progress(priority DESC, due_at) WHERE due_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memory_embedding (
  memory_id INTEGER PRIMARY KEY REFERENCES memory(id) ON DELETE CASCADE,
  input TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_model (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer TEXT NOT NULL,kind TEXT NOT NULL,topic TEXT NOT NULL,topic_key TEXT NOT NULL,
  text TEXT NOT NULL,confidence TEXT NOT NULL,observed_at INTEGER NOT NULL,
  expires_at INTEGER,updated_at INTEGER NOT NULL,
  UNIQUE(layer,kind,topic_key)
);
CREATE TABLE IF NOT EXISTS memory_model_evidence (
  model_id INTEGER NOT NULL REFERENCES memory_model(id) ON DELETE CASCADE,
  memory_id INTEGER NOT NULL REFERENCES memory(id) ON DELETE CASCADE,
  PRIMARY KEY(model_id,memory_id)
);
CREATE INDEX IF NOT EXISTS memory_model_source ON memory_model_evidence(memory_id);
CREATE TRIGGER IF NOT EXISTS memory_model_delete BEFORE DELETE ON memory BEGIN
  DELETE FROM memory_model WHERE id IN (
    SELECT model_id FROM memory_model_evidence WHERE memory_id=old.id
  );
END;
CREATE TRIGGER IF NOT EXISTS memory_model_invalidate BEFORE UPDATE OF kind,topic,text,state ON memory
WHEN old.kind IS NOT new.kind OR old.topic IS NOT new.topic OR old.text IS NOT new.text OR old.state IS NOT new.state BEGIN
  DELETE FROM memory_model WHERE id IN (
    SELECT model_id FROM memory_model_evidence WHERE memory_id=old.id
  );
END;
CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(text, topic, tokenize='trigram');
CREATE TRIGGER IF NOT EXISTS memory_insert AFTER INSERT ON memory BEGIN
  INSERT INTO memory_search(rowid, text, topic) VALUES(new.id, new.text, new.topic);
END;
CREATE TRIGGER IF NOT EXISTS memory_delete AFTER DELETE ON memory BEGIN
  DELETE FROM memory_search WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS memory_update AFTER UPDATE OF text, topic ON memory BEGIN
  DELETE FROM memory_search WHERE rowid = old.id;
  INSERT INTO memory_search(rowid, text, topic) VALUES(new.id, new.text, new.topic);
END;
CREATE VIRTUAL TABLE IF NOT EXISTS memory_words USING fts5(body, tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS memory_words_insert AFTER INSERT ON memory BEGIN
  INSERT INTO memory_words(rowid, body) VALUES(new.id, memory_segment(new.topic || ' ' || new.text));
END;
CREATE TRIGGER IF NOT EXISTS memory_words_delete AFTER DELETE ON memory BEGIN
  DELETE FROM memory_words WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS memory_words_update AFTER UPDATE OF text, topic ON memory BEGIN
  DELETE FROM memory_words WHERE rowid = old.id;
  INSERT INTO memory_words(rowid, body) VALUES(new.id, memory_segment(new.topic || ' ' || new.text));
END;
`;

export interface MemoryProgress extends MemorySource {
  checkedAt: number | null;
  readingAt: number | null;
  cursor: string | null;
  checkedCursor: string | null;
  dueAt: number | null;
  failures: number;
}

export interface MemoryEmbeddingDocument {
  id: number;
  input: string;
}

const EMBEDDING_FINGERPRINT = "embedding-fingerprint";
const EMBEDDING_INPUT = "m.topic || char(10) || m.text";
const PERSONAL_EPISODE =
  "(m.manual=1 OR EXISTS(SELECT 1 FROM evidence e WHERE e.memory_id=m.id AND e.kind<>'content'))";

type MemoryRow = Omit<AssistantMemory, "evidence" | "manual"> & {
  manual: number;
};
const MEMORY_COLUMNS = `m.id, m.kind, m.topic, m.text, m.state,
  m.observed_at AS observedAt, m.expires_at AS expiresAt, m.manual`;
const PROGRESS_COLUMNS = `kind, source_id AS id, checked_at AS checkedAt, reading_at AS readingAt,
  cursor, checked_cursor AS checkedCursor, due_at AS dueAt, failures`;
const MODEL_COLUMNS = `id,layer,kind,topic,text,confidence,observed_at AS observedAt,expires_at AS expiresAt`;
const ACTIVE_PROGRESS = `kind IN (${MEMORY_INGEST_KINDS.map(kind => `'${kind}'`).join(",")})`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const topicKey = (kind: string, topic: string) => hash(kind + "\0" + normalizeMemory(topic));
const factKey = (kind: string, topic: string, text: string) =>
  hash([kind, normalizeMemory(topic), normalizeMemory(text)].join("\0"));
const wordSegmenter = new Intl.Segmenter("zh", { granularity: "word" });
/** 与 searchTerms 同口径分词，供词级索引按空格切分。 */
const segmentWords = (text: unknown) =>
  [...wordSegmenter.segment(String(text).normalize("NFKC").toLowerCase())]
    .filter(word => word.isWordLike)
    .map(word => word.segment)
    .join(" ");
const sameMemory = (before: AssistantMemory, current: AssistantMemory | null) =>
  current !== null &&
  before.kind === current.kind &&
  before.topic === current.topic &&
  before.text === current.text &&
  before.state === current.state &&
  before.observedAt === current.observedAt;

export class MemoryStore {
  private readonly db: Database.Database;
  private vectorsLoaded = false;

  constructor(file: string) {
    this.db = new Database(file);
    try {
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      // 词级索引的触发器依赖此函数，所有写 memory 的连接都必须先注册。
      this.db.function("memory_segment", { deterministic: true }, segmentWords);
      this.db.exec(SCHEMA);
      if (!this.meta("words-indexed"))
        this.atomic(() => {
          this.db.exec(`DELETE FROM memory_words;
            INSERT INTO memory_words(rowid, body) SELECT id, memory_segment(topic || ' ' || text) FROM memory;`);
          this.setMeta("words-indexed", "1");
        });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close() {
    this.db.close();
  }
  atomic<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  meta(key: string): string | null {
    return (
      (this.db.prepare("SELECT value FROM meta WHERE key=?").pluck().get(key) as
        | string
        | undefined) ?? null
    );
  }

  setMeta(key: string, value: string) {
    this.db
      .prepare("INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  }

  mark(source: MemorySource, dueAt: number, priority = 1) {
    this.db
      .prepare(`INSERT INTO progress(kind,source_id,due_at,priority) VALUES(?,?,?,?)
      ON CONFLICT(kind,source_id) DO UPDATE SET due_at=excluded.due_at,
      priority=MAX(progress.priority,excluded.priority), failures=0,
      reading_at=NULL,cursor=CASE WHEN progress.kind='chat' THEN progress.cursor ELSE NULL END`)
      .run(source.kind, source.id, dueAt, priority);
  }

  resetHistory(source: MemorySource) {
    this.db
      .prepare("UPDATE progress SET checked_cursor=NULL,cursor=NULL WHERE kind=? AND source_id=?")
      .run(source.kind, source.id);
  }

  observe(source: MemorySource, modifiedAt: number, now: number, priority = 0) {
    const previous = this.progress(source);
    if (
      !previous ||
      (previous.checkedAt !== modifiedAt &&
        previous.readingAt !== modifiedAt &&
        previous.dueAt === null)
    )
      this.mark(source, now, priority);
  }

  progress(source: MemorySource): MemoryProgress | undefined {
    return this.db
      .prepare(`SELECT ${PROGRESS_COLUMNS} FROM progress WHERE kind=? AND source_id=?`)
      .get(source.kind, source.id) as MemoryProgress | undefined;
  }

  listTracked(kind: MemorySourceKind, after: string, limit: number): MemoryProgress[] {
    return this.db
      .prepare(`SELECT ${PROGRESS_COLUMNS} FROM progress
      WHERE kind=? AND source_id>? ORDER BY source_id LIMIT ?`)
      .all(kind, after, limit) as MemoryProgress[];
  }

  next(now: number): MemoryProgress | undefined {
    return this.due(now, 1)[0];
  }

  due(now: number, limit: number, historical = false): MemoryProgress[] {
    const order = historical
      ? "priority ASC,due_at,kind,source_id"
      : "priority DESC,due_at,kind,source_id";
    return this.db
      .prepare(`SELECT ${PROGRESS_COLUMNS} FROM progress INDEXED BY progress_due
        WHERE due_at IS NOT NULL AND ${ACTIVE_PROGRESS} AND due_at<=?
      ORDER BY ${order} LIMIT ?`)
      .all(now, limit) as MemoryProgress[];
  }

  nextDue(): number | null {
    return (
      (this.db
        .prepare(
          `SELECT MIN(due_at) FROM progress INDEXED BY progress_due WHERE ${ACTIVE_PROGRESS} AND due_at IS NOT NULL`
        )
        .pluck()
        .get() as number | null) ?? null
    );
  }

  checkpoint(
    source: MemorySource,
    modifiedAt: number,
    cursor: string | null,
    done: boolean,
    now: number
  ) {
    this.db
      .prepare(`UPDATE progress SET
      checked_at=CASE WHEN @done THEN @modifiedAt ELSE checked_at END,
      checked_cursor=CASE WHEN @done THEN @cursor ELSE checked_cursor END,
      reading_at=CASE WHEN @done THEN NULL ELSE @modifiedAt END,
      cursor=CASE WHEN @done THEN NULL ELSE @cursor END,
      due_at=CASE WHEN @done THEN NULL ELSE @now END,
      priority=CASE WHEN @done THEN 0 ELSE priority END, failures=0
      WHERE kind=@kind AND source_id=@id`)
      .run({ ...source, modifiedAt, cursor, done: Number(done), now });
  }

  fail(source: MemoryProgress, now: number) {
    const failures = source.failures + 1;
    this.db
      .prepare("UPDATE progress SET failures=?,due_at=? WHERE kind=? AND source_id=?")
      .run(
        failures,
        now + (failures >= 3 ? 3_600_000 : 2000 * 2 ** failures),
        source.kind,
        source.id
      );
  }

  retry(now: number) {
    this.db
      .prepare(`UPDATE progress SET failures=0,due_at=? WHERE ${ACTIVE_PROGRESS} AND failures>0`)
      .run(now);
  }

  pendingCount(limit: number): number {
    return this.db
      .prepare(
        `SELECT COUNT(*) FROM (SELECT 1 FROM progress INDEXED BY progress_due WHERE ${ACTIVE_PROGRESS} AND due_at IS NOT NULL LIMIT ?)`
      )
      .pluck()
      .get(limit) as number;
  }

  counts(): { checked: number; pending: number; failed: number } {
    return this.db
      .prepare(`SELECT COUNT(checked_at) AS checked, COUNT(due_at) AS pending,
      COUNT(CASE WHEN failures>=3 THEN 1 END) AS failed FROM progress WHERE ${ACTIVE_PROGRESS}`)
      .get() as ReturnType<MemoryStore["counts"]>;
  }

  private evidence(id: number): MemoryEvidence[] {
    return this.db
      .prepare(`SELECT kind,source_id AS id,anchor,quote FROM evidence WHERE memory_id=? LIMIT 12`)
      .all(id) as MemoryEvidence[];
  }

  private toMemory(row: MemoryRow): AssistantMemory {
    const { manual, ...rest } = row;
    return { ...rest, manual: Boolean(manual), evidence: this.evidence(row.id) };
  }

  get(id: number): AssistantMemory | null {
    const row = this.db.prepare(`SELECT ${MEMORY_COLUMNS} FROM memory m WHERE m.id=?`).get(id) as
      | MemoryRow
      | undefined;
    return row ? this.toMemory(row) : null;
  }

  search(params: MemorySearch, relevance = false): AssistantMemory[] {
    const terms = searchTerms(params.query ?? "");
    const long = terms.filter(term => [...term].length >= 3);
    const short = terms.filter(term => [...term].length < 3);
    const args: Array<string | number> = [];
    const where: string[] = [];
    const hits: string[] = [];
    if (long.length) {
      hits.push("m.id IN (SELECT rowid FROM memory_search WHERE memory_search MATCH ?)");
      args.push(long.map(term => '"' + term.replace(/"/g, '""') + '"').join(" OR "));
    }
    for (const term of short) {
      hits.push("instr(lower(m.text || ' ' || m.topic), ?) > 0");
      args.push(term);
    }
    if (hits.length) where.push("(" + hits.join(" OR ") + ")");
    const filters = this.searchFilters(params);
    where.push(...filters.where);
    args.push(...filters.args);
    const score =
      relevance && terms.length
        ? terms.map(() => "(instr(lower(m.topic || ' ' || m.text),?)>0)").join(" + ")
        : "";
    if (score) args.push(...terms);
    args.push(Math.min(100, Math.max(1, params.limit ?? 12)));
    const rows = this.db
      .prepare(`SELECT ${MEMORY_COLUMNS} FROM memory m
      ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${score ? "(" + score + ") DESC," : ""} m.id DESC LIMIT ?`)
      .all(...args) as MemoryRow[];
    return rows.map(row => this.toMemory(row));
  }

  /** 对账用的相关经历：词级索引 bm25 排序；跳过出现在大多数经历里的通用词，免得为全表打分。 */
  related(query: string, kind: AssistantMemory["kind"], limit: number): AssistantMemory[] {
    const total = this.db.prepare("SELECT count(*) FROM memory").pluck().get() as number;
    const common = Math.max(64, Math.floor(total * 0.05));
    const frequency = this.db
      .prepare(
        "SELECT count(*) FROM (SELECT 1 FROM memory_words WHERE memory_words MATCH ? LIMIT ?)"
      )
      .pluck();
    const quote = (term: string) => '"' + term.replace(/"/g, '""') + '"';
    const terms = searchTerms(query).filter(
      term => (frequency.get(quote(term), common + 1) as number) <= common
    );
    if (!terms.length) return [];
    const rows = this.db
      .prepare(`SELECT ${MEMORY_COLUMNS} FROM memory_words w JOIN memory m ON m.id=w.rowid
      WHERE memory_words MATCH ? AND m.kind=? AND ${PERSONAL_EPISODE} ORDER BY w.rank LIMIT ?`)
      .all(terms.map(quote).join(" OR "), kind, limit) as MemoryRow[];
    return rows.map(row => this.toMemory(row));
  }

  private searchFilters(params: MemorySearch) {
    const where: string[] = [PERSONAL_EPISODE];
    const args: Array<string | number> = [];
    if (params.kind) {
      where.push("m.kind=?");
      args.push(params.kind);
    }
    if (params.state && params.state !== "all") {
      where.push("m.state=?");
      args.push(params.state);
    }
    if (params.from !== undefined) {
      where.push("m.observed_at>=?");
      args.push(params.from);
    }
    if (params.to !== undefined) {
      where.push("m.observed_at<=?");
      args.push(params.to);
    }
    if (params.before !== undefined) {
      where.push("m.id<?");
      args.push(params.before);
    }
    return { where, args };
  }

  prepareEmbeddings(fingerprint: string, dimensions: number) {
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) throw new Error("记忆嵌入维度无效");
    if (!this.vectorsLoaded) {
      loadSqliteVecExtension(this.db);
      this.vectorsLoaded = true;
    }
    this.atomic(() => {
      const table = this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_vec'")
        .get();
      if (!table || this.meta(EMBEDDING_FINGERPRINT) !== fingerprint) {
        this.db.exec(`
          DROP TRIGGER IF EXISTS temp.memory_vec_delete;
          DROP TRIGGER IF EXISTS temp.memory_vec_update;
          DROP TABLE IF EXISTS memory_vec;
          DELETE FROM memory_embedding;
          CREATE VIRTUAL TABLE memory_vec USING vec0(
            embedding FLOAT[${dimensions}] distance_metric=cosine
          );
        `);
        this.setMeta(EMBEDDING_FINGERPRINT, fingerprint);
      }
      // 临时触发器只在扩展可用的连接上安装，不让派生索引阻断记忆读写。
      this.db.exec(`
        CREATE TEMP TRIGGER IF NOT EXISTS memory_vec_delete AFTER DELETE ON main.memory BEGIN
          DELETE FROM memory_vec WHERE rowid=old.id;
        END;
        CREATE TEMP TRIGGER IF NOT EXISTS memory_vec_update AFTER UPDATE OF topic,text ON main.memory
        WHEN old.topic IS NOT new.topic OR old.text IS NOT new.text BEGIN
          DELETE FROM memory_vec WHERE rowid=old.id;
          DELETE FROM memory_embedding WHERE memory_id=old.id;
        END;
        DELETE FROM memory_vec WHERE rowid NOT IN (
          SELECT m.id FROM memory m JOIN memory_embedding e ON e.memory_id=m.id
          WHERE e.input=${EMBEDDING_INPUT}
        );
      `);
    });
  }

  pendingEmbeddings(limit: number): MemoryEmbeddingDocument[] {
    return this.db
      .prepare(`SELECT m.id,${EMBEDDING_INPUT} AS input FROM memory m
        LEFT JOIN memory_embedding e ON e.memory_id=m.id
        WHERE (e.memory_id IS NULL OR e.input<>${EMBEDDING_INPUT}) AND ${PERSONAL_EPISODE}
        ORDER BY m.id DESC LIMIT ?`)
      .all(limit) as MemoryEmbeddingDocument[];
  }

  hasEmbeddings(fingerprint: string): boolean {
    return (
      this.vectorsLoaded &&
      this.meta(EMBEDDING_FINGERPRINT) === fingerprint &&
      Boolean(this.db.prepare("SELECT 1 FROM memory_embedding LIMIT 1").get())
    );
  }

  writeEmbeddings(
    documents: MemoryEmbeddingDocument[],
    embeddings: number[][],
    fingerprint: string,
    dimensions: number
  ) {
    if (
      embeddings.length !== documents.length ||
      embeddings.some(vector => vector.length !== dimensions || !vector.every(Number.isFinite))
    )
      throw new Error("记忆嵌入结果无效");
    if (!this.vectorsLoaded || this.meta(EMBEDDING_FINGERPRINT) !== fingerprint) return;
    this.atomic(() => {
      const current = this.db.prepare(`SELECT 1 FROM memory m WHERE id=? AND ${EMBEDDING_INPUT}=?`);
      const remove = this.db.prepare("DELETE FROM memory_vec WHERE rowid=?");
      const insert = this.db.prepare("INSERT INTO memory_vec(rowid,embedding) VALUES(?,?)");
      const checkpoint = this.db.prepare(`INSERT INTO memory_embedding VALUES(?,?)
        ON CONFLICT(memory_id) DO UPDATE SET input=excluded.input`);
      for (const [index, document] of documents.entries()) {
        if (!current.get(document.id, document.input)) continue;
        remove.run(BigInt(document.id));
        insert.run(BigInt(document.id), JSON.stringify(embeddings[index]));
        checkpoint.run(document.id, document.input);
      }
    });
  }

  searchEmbeddings(
    vector: number[],
    params: MemorySearch,
    fingerprint: string,
    distance: number
  ): AssistantMemory[] {
    if (!this.hasEmbeddings(fingerprint)) return [];
    const filters = this.searchFilters(params);
    // 先按事实库过滤再取近邻，避免历史条目占满当前记忆的候选名额。
    const rows = this.db
      .prepare(`SELECT rowid AS id,distance FROM memory_vec
        WHERE embedding MATCH ? AND k=? AND rowid IN (
          SELECT m.id FROM memory m JOIN memory_embedding e ON e.memory_id=m.id
          WHERE e.input=${EMBEDDING_INPUT}
            ${filters.where.length ? "AND " + filters.where.join(" AND ") : ""}
        ) AND distance<? ORDER BY distance`)
      .all(
        JSON.stringify(vector),
        Math.min(100, params.limit ?? 12),
        ...filters.args,
        distance
      ) as Array<{ id: number }>;
    return rows.flatMap(row => {
      const memory = this.get(row.id);
      return memory ? [memory] : [];
    });
  }

  hasMemories(): boolean {
    return Boolean(
      this.db.prepare(`SELECT 1 FROM memory m WHERE ${PERSONAL_EPISODE} LIMIT 1`).get()
    );
  }

  reviewPage(after: number, limit: number): AssistantMemory[] {
    return (
      this.db
        .prepare(
          `SELECT ${MEMORY_COLUMNS} FROM memory m WHERE m.id>? AND ${PERSONAL_EPISODE} ORDER BY m.id LIMIT ?`
        )
        .all(after, limit) as MemoryRow[]
    ).map(row => this.toMemory(row));
  }

  reflectionEpisodes(): AssistantMemory[] {
    const linked = this.db
      .prepare(`SELECT ${MEMORY_COLUMNS} FROM memory m
      WHERE m.id IN (SELECT memory_id FROM memory_model_evidence)
      ORDER BY m.observed_at DESC LIMIT 64`)
      .all() as MemoryRow[];
    const recent = this.db
      .prepare(`SELECT ${MEMORY_COLUMNS} FROM memory m
      WHERE ${PERSONAL_EPISODE}
      ORDER BY m.observed_at DESC,m.id DESC LIMIT 64`)
      .all() as MemoryRow[];
    return [...new Map([...recent, ...linked].map(row => [row.id, this.toMemory(row)])).values()];
  }

  private toModel(row: Omit<PersonalMemoryModel, "episodeIds">): PersonalMemoryModel {
    const episodeIds = this.db
      .prepare(
        "SELECT memory_id FROM memory_model_evidence WHERE model_id=? ORDER BY memory_id LIMIT 8"
      )
      .pluck()
      .all(row.id) as number[];
    return { ...row, episodeIds };
  }

  getModel(id: number): PersonalMemoryModel | null {
    const row = this.db.prepare(`SELECT ${MODEL_COLUMNS} FROM memory_model WHERE id=?`).get(id) as
      | Omit<PersonalMemoryModel, "episodeIds">
      | undefined;
    return row ? this.toModel(row) : null;
  }

  debugData(fingerprint: string | null, limit = 40): MemoryDebugData {
    const bounded = Math.min(200, Math.max(1, limit));
    const total = this.db.prepare("SELECT COUNT(*) FROM memory").pluck().get() as number;
    const episodes = this.db
      .prepare(`SELECT COUNT(*) FROM memory m WHERE ${PERSONAL_EPISODE}`)
      .pluck()
      .get() as number;
    const modelCounts = this.db
      .prepare(`SELECT COUNT(CASE WHEN layer='profile' THEN 1 END) AS profile,
      COUNT(CASE WHEN layer='state' THEN 1 END) AS state FROM memory_model`)
      .get() as { profile: number; state: number };
    const indexed =
      fingerprint && this.meta(EMBEDDING_FINGERPRINT) === fingerprint
        ? (this.db
            .prepare(`SELECT COUNT(*) FROM memory_embedding e JOIN memory m ON m.id=e.memory_id
          WHERE e.input=${EMBEDDING_INPUT} AND ${PERSONAL_EPISODE}`)
            .pluck()
            .get() as number)
        : 0;
    const models = (layer: "state" | "profile"): MemoryDebugModel[] => {
      const rows = this.db
        .prepare(`SELECT ${MODEL_COLUMNS},updated_at AS updatedAt FROM memory_model
        WHERE layer=? ORDER BY updated_at DESC,id DESC LIMIT ?`)
        .all(layer, bounded) as Omit<MemoryDebugModel, "episodeIds">[];
      return rows.map(row => ({ ...this.toModel(row), updatedAt: row.updatedAt }));
    };
    const rows = this.db
      .prepare(`SELECT ${MEMORY_COLUMNS},m.touched_at AS updatedAt FROM memory m
      WHERE ${PERSONAL_EPISODE} ORDER BY m.touched_at DESC,m.id DESC LIMIT ?`)
      .all(bounded) as Array<MemoryRow & { updatedAt: number }>;
    return {
      counts: {
        episodes,
        excluded: total - episodes,
        ...modelCounts,
        indexed,
        pendingVectors: Math.max(0, episodes - indexed),
      },
      progress: this.counts(),
      profile: models("profile"),
      recent: models("state"),
      limit: bounded,
      episodes: rows.map(row => {
        const { evidence, ...item } = this.toMemory(row);
        return {
          ...item,
          updatedAt: row.updatedAt,
          evidenceCount: evidence.length,
          sourceKinds: [...new Set(evidence.map(ref => ref.kind))],
        };
      }),
    };
  }

  searchModels(
    params: MemorySearch,
    now: number,
    relatedIds: number[] = []
  ): PersonalMemoryModel[] {
    if (params.layer === "episode" || params.state === "history" || params.state === "observation")
      return [];
    const terms = searchTerms(params.query ?? "");
    const where = ["(expires_at IS NULL OR expires_at>?)"];
    const args: Array<string | number> = [now];
    if (params.layer === "state" || params.layer === "profile") {
      where.push("layer=?");
      args.push(params.layer);
    }
    if (params.kind) {
      where.push("kind=?");
      args.push(params.kind);
    }
    if (params.from !== undefined) {
      where.push("observed_at>=?");
      args.push(params.from);
    }
    if (params.to !== undefined) {
      where.push("observed_at<=?");
      args.push(params.to);
    }
    const related = relatedIds.length
      ? `EXISTS(SELECT 1 FROM memory_model_evidence e WHERE e.model_id=memory_model.id AND e.memory_id IN (${relatedIds.map(() => "?").join(",")}))`
      : "0.0";
    const score = [...terms.map(() => "(instr(lower(topic || ' ' || text),?)>0)"), related].join(
      " + "
    );
    const rows = this.db
      .prepare(`SELECT ${MODEL_COLUMNS} FROM memory_model
      WHERE ${where.join(" AND ")} ORDER BY (${score}) DESC,observed_at DESC,id DESC LIMIT ?`)
      .all(...args, ...terms, ...relatedIds, Math.min(32, params.limit ?? 12)) as Omit<
      PersonalMemoryModel,
      "episodeIds"
    >[];
    return rows.map(row => this.toModel(row));
  }

  applyModels(
    candidates: MemoryModelCandidate[],
    snapshots: Map<number, AssistantMemory>,
    now: number
  ) {
    this.atomic(() => {
      for (const candidate of candidates) {
        if (
          !candidate.episodeIds.every(id => {
            const before = snapshots.get(id);
            const current = this.get(id);
            return (
              before &&
              current &&
              before.kind === current.kind &&
              before.topic === current.topic &&
              before.text === current.text &&
              before.state === current.state &&
              before.observedAt === current.observedAt
            );
          })
        )
          continue;
        const row = this.db
          .prepare(`INSERT INTO memory_model
          (layer,kind,topic,topic_key,text,confidence,observed_at,expires_at,updated_at)
          VALUES(@layer,@kind,@topic,@topicKey,@text,@confidence,@observedAt,@expiresAt,@now)
          ON CONFLICT(layer,kind,topic_key) DO UPDATE SET topic=excluded.topic,text=excluded.text,
            confidence=excluded.confidence,observed_at=excluded.observed_at,
            expires_at=excluded.expires_at,updated_at=excluded.updated_at
          WHERE memory_model.observed_at<=excluded.observed_at AND
            (memory_model.confidence<>'explicit' OR excluded.confidence='explicit' OR memory_model.expires_at<=@now)
          RETURNING id`)
          .get({ ...candidate, topicKey: topicKey(candidate.kind, candidate.topic), now }) as
          | { id: number }
          | undefined;
        if (!row) continue;
        this.db.prepare("DELETE FROM memory_model_evidence WHERE model_id=?").run(row.id);
        const insert = this.db.prepare("INSERT INTO memory_model_evidence VALUES(?,?)");
        for (const id of candidate.episodeIds) insert.run(row.id, id);
      }
    });
  }

  retireModels(ids: number[]) {
    for (const id of ids) this.db.prepare("DELETE FROM memory_model WHERE id=?").run(id);
  }

  upsertRhythmModel(topic: string, text: string, observedAt: number, expiresAt: number) {
    this.db
      .prepare(`INSERT INTO memory_model
        (layer,kind,topic,topic_key,text,confidence,observed_at,expires_at,updated_at)
        VALUES('profile','routine',@topic,@topicKey,@text,'supported',@observedAt,@expiresAt,@observedAt)
        ON CONFLICT(layer,kind,topic_key) DO UPDATE SET
          text=excluded.text,observed_at=excluded.observed_at,
          expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
      .run({ topic, topicKey: topicKey("routine", topic), text, observedAt, expiresAt });
  }

  expireModels(now: number) {
    // 按到期时间清理：有 expires_at 的 model 到期后删除
    this.db
      .prepare("DELETE FROM memory_model WHERE expires_at IS NOT NULL AND expires_at<=?")
      .run(now);
    // 清理孤立 model：无 expires_at 且无 evidence（episode 被删后 trigger 级联删了 evidence，model 残留）
    this.db
      .prepare(
        "DELETE FROM memory_model WHERE expires_at IS NULL AND NOT EXISTS(SELECT 1 FROM memory_model_evidence e WHERE e.model_id=memory_model.id)"
      )
      .run();
  }

  pruneMemory(id: number, keep: (evidence: MemoryEvidence) => boolean) {
    const remove = this.db.prepare(
      "DELETE FROM evidence WHERE memory_id=? AND kind=? AND source_id=? AND anchor=? AND quote=?"
    );
    for (const ref of this.evidence(id))
      if (!keep(ref)) remove.run(id, ref.kind, ref.id, ref.anchor, ref.quote);
    this.db
      .prepare(
        "DELETE FROM memory WHERE id=? AND manual=0 AND NOT EXISTS(SELECT 1 FROM evidence WHERE memory_id=?)"
      )
      .run(id, id);
  }

  sourceEvidence(source: MemorySource) {
    return this.db
      .prepare(`SELECT memory_id AS memoryId, kind, source_id AS id, anchor, quote
      FROM evidence WHERE kind=? AND source_id=?`)
      .all(source.kind, source.id) as Array<MemoryEvidence & { memoryId: number }>;
  }

  pruneEvidence(source: MemorySource, keep: (evidence: MemoryEvidence) => boolean) {
    const remove = this.db.prepare(
      "DELETE FROM evidence WHERE memory_id=? AND kind=? AND source_id=? AND anchor=? AND quote=?"
    );
    const orphan = this.db.prepare(
      "DELETE FROM memory WHERE id=? AND manual=0 AND NOT EXISTS(SELECT 1 FROM evidence WHERE memory_id=?)"
    );
    for (const evidence of this.sourceEvidence(source)) {
      if (keep(evidence)) continue;
      remove.run(evidence.memoryId, evidence.kind, evidence.id, evidence.anchor, evidence.quote);
      orphan.run(evidence.memoryId, evidence.memoryId);
    }
  }

  removeSource(source: MemorySource) {
    this.pruneEvidence(source, () => false);
    this.db
      .prepare("DELETE FROM progress WHERE kind=? AND source_id=?")
      .run(source.kind, source.id);
  }

  hiddenSource(source: MemorySource): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM forgotten_anchor WHERE kind=? AND source_id=? LIMIT 1")
      .get(source.kind, source.id);
  }

  hiddenAnchor(source: MemorySource, anchor: string): boolean {
    if (source.kind === "content" || source.kind === "diary") return this.hiddenSource(source);
    if (source.kind === "chat") {
      const message = anchor.split(":")[0];
      return !!this.db
        .prepare(`SELECT 1 FROM forgotten_anchor WHERE kind='chat' AND source_id=?
        AND substr(anchor,1,length(?)+1)=? || ':' LIMIT 1`)
        .get(source.id, message, message);
    }
    return !!this.db
      .prepare("SELECT 1 FROM forgotten_anchor WHERE kind=? AND source_id=? AND anchor=?")
      .get(source.kind, source.id, anchor);
  }

  private addEvidence(id: number, refs: MemoryEvidence[]) {
    const insert = this.db.prepare("INSERT OR IGNORE INTO evidence VALUES(?,?,?,?,?)");
    for (const ref of refs) insert.run(id, ref.kind, ref.id, ref.anchor, ref.quote);
  }

  apply(candidates: MemoryCandidate[], now: number) {
    const insert = this.db
      .prepare(`INSERT INTO memory(kind,topic,topic_key,text,fact_key,state,observed_at,expires_at,touched_at)
      VALUES(@kind,@topic,@topicKey,@text,@key,@state,@observedAt,@expiresAt,@now)
      ON CONFLICT(fact_key) DO UPDATE SET touched_at=excluded.touched_at,
        observed_at=MAX(memory.observed_at,excluded.observed_at),
        expires_at=CASE WHEN memory.manual=0 AND excluded.observed_at>=memory.observed_at THEN excluded.expires_at ELSE memory.expires_at END,
        state=CASE WHEN memory.manual=0 AND excluded.state='current' AND excluded.observed_at>=memory.observed_at THEN 'current' ELSE memory.state END
      RETURNING id`);
    for (const candidate of candidates) {
      const key = factKey(candidate.kind, candidate.topic, candidate.text);
      if (this.db.prepare("SELECT 1 FROM forgotten_fact WHERE fact_key=?").get(key)) continue;
      const evidence = candidate.evidence.filter(ref => !this.hiddenAnchor(ref, ref.anchor));
      if (!evidence.length) continue;
      const topic = topicKey(candidate.kind, candidate.topic);
      const latest = this.db
        .prepare(`SELECT id,observed_at,manual FROM memory
        WHERE topic_key=? AND state='current' ORDER BY observed_at DESC,manual DESC LIMIT 1`)
        .get(topic) as { id: number; observed_at: number; manual: number } | undefined;
      const state =
        candidate.state === "current" && latest && latest.observed_at > candidate.observedAt
          ? "history"
          : candidate.state;
      const row = insert.get({
        ...candidate,
        topicKey: topic,
        key,
        state,
        expiresAt: candidate.expiresAt ?? null,
        now,
      }) as { id: number };
      this.addEvidence(row.id, evidence);
      if (candidate.profile && state === "current") this.declareProfile(row.id, now);
      // activity 深度编辑写入时，续期同 topic 的 current state memory（最多 90 天）
      if (
        candidate.evidence.every(ref => ref.kind === "activity") &&
        candidate.text.includes("深度编辑") &&
        state === "current"
      ) {
        const extendedExpiry = now + 90 * 86_400_000;
        this.db
          .prepare(`UPDATE memory SET expires_at=?,touched_at=?
          WHERE topic_key=? AND state='current' AND manual=0
            AND (expires_at IS NULL OR expires_at > ?)
            AND EXISTS(SELECT 1 FROM evidence WHERE memory_id=memory.id AND kind<>'activity')`)
          .run(extendedExpiry, now, topic, now);
      }
    }
  }

  correct(id: number, correction: MemoryCorrection, now: number): AssistantMemory | null {
    return this.atomic(() => {
      const old = this.get(id);
      if (!old) return null;
      const key = factKey(correction.kind, correction.topic, correction.text);
      const duplicate = this.db
        .prepare("SELECT id FROM memory WHERE fact_key=? AND id<>?")
        .get(key, id) as { id: number } | undefined;
      if (duplicate) {
        this.addEvidence(id, this.evidence(duplicate.id));
        this.db.prepare("DELETE FROM memory WHERE id=?").run(duplicate.id);
      }
      this.db
        .prepare("INSERT OR IGNORE INTO forgotten_fact VALUES(?)")
        .run(factKey(old.kind, old.topic, old.text));
      this.db.prepare("DELETE FROM forgotten_fact WHERE fact_key=?").run(key);
      this.db
        .prepare(`UPDATE memory SET kind=@kind,topic=@topic,text=@text,topic_key=@topicKey,fact_key=@key,
        state=@state,observed_at=@now,expires_at=NULL,manual=1,touched_at=@now WHERE id=@id`)
        .run({
          ...correction,
          id,
          key,
          topicKey: topicKey(correction.kind, correction.topic),
          now,
        });
      if (
        correction.state === "current" &&
        ["preference", "routine", "interest"].includes(correction.kind)
      )
        this.declareProfile(id, now);
      return this.get(id);
    });
  }

  private declareProfile(id: number, now: number) {
    const item = this.get(id);
    if (!item) return;
    this.applyModels(
      [
        {
          layer: "profile",
          kind: item.kind,
          topic: item.topic,
          text: item.text,
          confidence: "explicit",
          observedAt: item.observedAt,
          expiresAt: null,
          episodeIds: [id],
        },
      ],
      new Map([[id, item]]),
      now
    );
  }

  forget(id: number): boolean {
    return this.atomic(() => {
      const old = this.get(id);
      if (!old) return false;
      this.db
        .prepare("INSERT OR IGNORE INTO forgotten_fact VALUES(?)")
        .run(factKey(old.kind, old.topic, old.text));
      this.db
        .prepare(`INSERT OR IGNORE INTO forgotten_anchor
        SELECT kind,source_id,anchor FROM evidence WHERE memory_id=?`)
        .run(id);
      this.db.prepare("DELETE FROM memory WHERE id=?").run(id);
      return true;
    });
  }

  /** 按对账结果落库；目标在模型等待期间被改动时按新增处理。 */
  reconcile(entries: ReconcileEntry[], now: number) {
    for (const { candidate, op, target } of entries) {
      if (op === "add" || !target || !sameMemory(target, this.get(target.id))) {
        this.apply([candidate], now);
        continue;
      }
      const forgotten = this.db.prepare("SELECT 1 FROM forgotten_fact WHERE fact_key=?");
      if (forgotten.get(factKey(candidate.kind, candidate.topic, candidate.text))) continue;
      const evidence = candidate.evidence.filter(ref => !this.hiddenAnchor(ref, ref.anchor));
      if (!evidence.length) continue;
      if (op === "supersede") {
        this.db
          .prepare("UPDATE memory SET state='history',touched_at=? WHERE id=?")
          .run(now, target.id);
        this.apply([{ ...candidate, topic: target.topic }], now);
        continue;
      }
      if (op === "revise") {
        const key = factKey(target.kind, target.topic, candidate.text);
        if (forgotten.get(key)) continue;
        if (
          this.db.prepare("SELECT 1 FROM memory WHERE fact_key=? AND id<>?").get(key, target.id)
        ) {
          this.apply([{ ...candidate, topic: target.topic }], now);
          continue;
        }
        this.db
          .prepare(`UPDATE memory SET text=?,fact_key=?,state=?,observed_at=?,expires_at=?,touched_at=?
          WHERE id=?`)
          .run(
            candidate.text,
            key,
            candidate.state,
            candidate.observedAt,
            candidate.expiresAt ?? null,
            now,
            target.id
          );
      } else this.reinforce(target.id, candidate, now);
      this.addEvidence(target.id, evidence);
      if (candidate.profile && this.get(target.id)?.state === "current")
        this.declareProfile(target.id, now);
    }
  }

  /** 复核已有经历之间的对账：重复的并入一条，被推翻的转为历史。 */
  reconcileEpisodes(
    entries: Array<{ subject: AssistantMemory; op: ReconcileOp; target?: AssistantMemory }>,
    now: number
  ) {
    this.atomic(() => {
      for (const { subject, op, target } of entries) {
        if (op === "add" || !target || subject.manual) continue;
        if (!sameMemory(subject, this.get(subject.id)) || !sameMemory(target, this.get(target.id)))
          continue;
        if (op === "supersede")
          this.db
            .prepare("UPDATE memory SET state='history',touched_at=? WHERE id=?")
            .run(now, target.id);
        else if (op === "revise") this.absorb(subject, target, now);
        else this.absorb(target, subject, now);
      }
    });
  }

  private reinforce(
    id: number,
    by: Pick<AssistantMemory, "state" | "observedAt"> & { expiresAt?: number | null },
    now: number
  ) {
    this.db
      .prepare(`UPDATE memory SET touched_at=@now,observed_at=MAX(observed_at,@observedAt),
        expires_at=CASE WHEN manual=0 AND @observedAt>=observed_at THEN @expiresAt ELSE expires_at END,
        state=CASE WHEN manual=0 AND @state='current' AND @observedAt>=observed_at THEN 'current' ELSE state END
      WHERE id=@id`)
      .run({
        id,
        now,
        state: by.state,
        observedAt: by.observedAt,
        expiresAt: by.expiresAt ?? null,
      });
  }

  private absorb(keep: AssistantMemory, drop: AssistantMemory, now: number) {
    this.addEvidence(keep.id, drop.evidence);
    this.db
      .prepare("UPDATE OR IGNORE memory_model_evidence SET memory_id=? WHERE memory_id=?")
      .run(keep.id, drop.id);
    this.db.prepare("DELETE FROM memory_model_evidence WHERE memory_id=?").run(drop.id);
    this.reinforce(keep.id, drop, now);
    this.db.prepare("DELETE FROM memory WHERE id=?").run(drop.id);
  }

  nextExpiry(): number | null {
    return (
      (this.db
        .prepare("SELECT MIN(expires_at) FROM memory WHERE state='current' AND manual=0")
        .pluck()
        .get() as number | null) ?? null
    );
  }

  expire(now: number) {
    this.db
      .prepare(
        "UPDATE memory SET state='history' WHERE state='current' AND expires_at<=? AND manual=0"
      )
      .run(now);
  }

  /** 将长期未被新证据强化的 supported profile 模型降级为 observation，防止旧推断以高置信度幽灵留存。 */
  decayModels(now: number, decayMs: number) {
    this.db
      .prepare(
        `UPDATE memory_model SET confidence='observation'
        WHERE layer='profile' AND confidence='supported' AND updated_at<=?`
      )
      .run(now - decayMs);
  }
}

export function openMemoryStoreForLibrary(
  directory: string,
  name: string,
  identity: string,
  birth: string
): MemoryStore {
  const open = (key: string) =>
    new MemoryStore(join(directory, createHash("sha256").update(key).digest("hex") + ".sqlite"));
  let store = open(name);
  const recordedIdentity = store.meta("library-source");
  const recordedBirth = store.meta("library-birth");
  if (
    recordedBirth &&
    !(identity && recordedIdentity === identity) &&
    (recordedBirth !== birth ||
      Boolean(identity && recordedIdentity && identity !== recordedIdentity))
  ) {
    store.close();
    store = open(name + "\0" + (identity || birth));
  }
  store.atomic(() => {
    store.setMeta("library-birth", birth);
    if (identity) store.setMeta("library-source", identity);
  });
  return store;
}
