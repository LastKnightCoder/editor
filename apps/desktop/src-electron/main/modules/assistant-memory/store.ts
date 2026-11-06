import { createHash } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  AssistantMemory,
  AssistantMemoryStatus,
  MemoryCorrection,
  MemoryEvidence,
  MemorySearch,
  MemorySource,
  MemorySourceKind,
} from "@/types/assistant-memory";
import { normalizeMemory, searchTerms, type MemoryCandidate } from "./extraction";

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
`;

export interface MemoryProgress extends MemorySource {
  checkedAt: number | null;
  readingAt: number | null;
  cursor: string | null;
  checkedCursor: string | null;
  dueAt: number | null;
  failures: number;
}

type MemoryRow = Omit<AssistantMemory, "evidence" | "manual"> & {
  manual: number;
};
const MEMORY_COLUMNS = `m.id, m.kind, m.topic, m.text, m.state,
  m.observed_at AS observedAt, m.expires_at AS expiresAt, m.manual`;
const PROGRESS_COLUMNS = `kind, source_id AS id, checked_at AS checkedAt, reading_at AS readingAt,
  cursor, checked_cursor AS checkedCursor, due_at AS dueAt, failures`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const topicKey = (kind: string, topic: string) => hash(kind + "\0" + normalizeMemory(topic));
const factKey = (kind: string, topic: string, text: string) =>
  hash([kind, normalizeMemory(topic), normalizeMemory(text)].join("\0"));

export class MemoryStore {
  private readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    try {
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this.db.exec(SCHEMA);
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
      .prepare(`SELECT ${PROGRESS_COLUMNS} FROM progress WHERE due_at<=?
      ORDER BY ${order} LIMIT ?`)
      .all(now, limit) as MemoryProgress[];
  }

  nextDue(): number | null {
    return (
      (this.db
        .prepare("SELECT MIN(due_at) FROM progress WHERE due_at IS NOT NULL")
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
      .run(failures, failures >= 3 ? null : now + 2000 * 2 ** failures, source.kind, source.id);
  }

  retry(now: number) {
    this.db.prepare("UPDATE progress SET failures=0,due_at=? WHERE failures>0").run(now);
  }

  pendingCount(limit: number): number {
    return this.db
      .prepare("SELECT COUNT(*) FROM (SELECT 1 FROM progress WHERE due_at IS NOT NULL LIMIT ?)")
      .pluck()
      .get(limit) as number;
  }

  counts(): Pick<AssistantMemoryStatus, "checked" | "pending" | "failed"> {
    return this.db
      .prepare(`SELECT COUNT(checked_at) AS checked, COUNT(due_at) AS pending,
      COUNT(CASE WHEN failures>=3 THEN 1 END) AS failed FROM progress`)
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
    if (source.kind === "content") return this.hiddenSource(source);
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
        state=CASE WHEN memory.manual=0 AND memory.state='observation' AND excluded.state='current' THEN 'current' ELSE memory.state END
      RETURNING id`);
    for (const candidate of candidates) {
      const key = factKey(candidate.kind, candidate.topic, candidate.text);
      if (this.db.prepare("SELECT 1 FROM forgotten_fact WHERE fact_key=?").get(key)) continue;
      const evidence = candidate.evidence.filter(ref => !this.hiddenAnchor(ref, ref.anchor));
      if (!evidence.length) continue;
      const topic = topicKey(candidate.kind, candidate.topic);
      const latest = this.db
        .prepare(`SELECT id,observed_at,manual FROM memory
        WHERE topic_key=? AND state='current' ORDER BY manual DESC,observed_at DESC LIMIT 1`)
        .get(topic) as { id: number; observed_at: number; manual: number } | undefined;
      const state =
        candidate.state === "current" &&
        latest &&
        (latest.observed_at > candidate.observedAt || latest.manual)
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
      if (candidate.replaces && candidate.replaces !== row.id && state === "current") {
        this.db
          .prepare(`UPDATE memory SET state='history',touched_at=?
          WHERE id=? AND manual=0 AND observed_at<=? AND state='current'`)
          .run(now, candidate.replaces, candidate.observedAt);
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
      return this.get(id);
    });
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

  dreamCandidates(since: number): AssistantMemory[] {
    return (
      this.db
        .prepare(`SELECT ${MEMORY_COLUMNS} FROM memory m WHERE m.touched_at>=? AND m.manual=0
      ORDER BY m.touched_at DESC LIMIT 36`)
        .all(since) as MemoryRow[]
    ).map(row => this.toMemory(row));
  }

  applyDream(groups: { keep: number; merge: number[] }[], allowed: Set<number>, now: number) {
    this.atomic(() => {
      for (const group of groups) {
        if (!allowed.has(group.keep)) continue;
        const keep = this.get(group.keep);
        if (!keep || keep.manual) continue;
        for (const id of group.merge) {
          if (id === keep.id || !allowed.has(id)) continue;
          const duplicate = this.get(id);
          if (
            !duplicate ||
            duplicate.manual ||
            duplicate.kind !== keep.kind ||
            duplicate.state !== keep.state ||
            normalizeMemory(duplicate.topic) !== normalizeMemory(keep.topic) ||
            duplicate.expiresAt !== keep.expiresAt
          )
            continue;
          this.addEvidence(keep.id, duplicate.evidence);
          this.db.prepare("DELETE FROM memory WHERE id=?").run(id);
        }
      }
      this.db
        .prepare(
          "UPDATE memory SET state='history' WHERE state='current' AND expires_at<=? AND manual=0"
        )
        .run(now);
    });
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
