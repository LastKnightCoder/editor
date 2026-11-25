import * as Y from "yjs";
import { NODE_DOCUMENT_MAX_BYTES, readNodeDocument } from "./node-document";
import { CollaborationError, type ContentNode, type SharedContent } from "./protocol";
import { sharedValueEquals } from "./shared-values";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { base64ToBytes, bytesToBase64 } from "./encoding";

export interface DocumentHistoryEntry {
  sequence: number;
  operationId: string;
  actorId: string;
  actorName: string;
  time: number;
  kind: "baseline" | "edit" | "undo" | "restore";
  target?: number;
  source?: string;
  sourceRevision?: string;
  /** 合并单元的首次提交时间，未合并时与 time 相同 */
  firstTime?: number;
  /** 该版本合并了多少次后续提交，未合并时缺省 */
  mergedCount?: number;
}

export type DocumentHistoryActor = Pick<DocumentHistoryEntry, "actorId" | "actorName" | "source">;

export interface DocumentHistoryChange {
  blockId: string;
  kind: "insert" | "delete" | "modify" | "move";
  before?: ContentNode;
  after?: ContentNode;
}

export interface DocumentHistoryPreview {
  entry: DocumentHistoryEntry;
  value: SharedContent;
  contracts: ContentContractDictionary;
  changes: DocumentHistoryChange[];
  previousTitle?: string;
  headRevision: string;
  canRestore: boolean;
  canUndo: boolean;
}

export interface DocumentHistoryReader {
  entry(id: string, sequence: number): DocumentHistoryEntry;
  replay(id: string, sequence: number): Y.Doc;
  undone(id: string, sequence: number): boolean;
}

type SqlValue = string | number | Uint8Array;
export interface DocumentHistorySql {
  exec(sql: string, ...values: SqlValue[]): void;
  all<Row>(sql: string, ...values: SqlValue[]): Row[];
}

interface HistoryRow {
  sequence: number;
  revision: string;
  checkpoint: number;
  byte_count: number;
  metadata: string;
}
interface HistoryPayloadPart {
  sequence: number;
  part: number;
  state: ArrayBuffer | Uint8Array;
}

export interface TransferredDocumentHistoryVersion {
  entry: DocumentHistoryEntry;
  revision: string;
  checkpoint: number;
  storage: string[];
}

const PART_BYTES = 512 * 1024;
const CHECKPOINT_INTERVAL = 128;
const CHECKPOINT_REPLAY_BYTES = 1024 * 1024;
/** 相邻提交间隔不超过该值视为同一次连续编辑 */
export const HISTORY_MERGE_IDLE_MS = 60_000;
/** 单个合并单元的最长跨度，避免长时间连续书写挤成一条 */
export const HISTORY_MERGE_SPAN_MS = 10 * 60_000;
export const HISTORY_MERGE_MAX_UPDATES = 200;

export interface DocumentHistoryWrite {
  operationId: string;
  actor: DocumentHistoryActor;
  kind?: "edit" | "restore" | "undo";
  target?: number;
  time?: number;
  sourceRevision?: string;
  previousRevision: string;
  revision: string;
  update: Uint8Array;
  before: () => Uint8Array;
  after: () => Uint8Array;
  checkBytes?: (bytes: number) => void;
  /** 连续编辑并入上一条记录；冷写与历史导入必须显式关闭 */
  merge?: boolean;
}

export const documentHistorySchema = `
CREATE TABLE IF NOT EXISTS document_history_entries (
  document_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  operation_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  checkpoint INTEGER NOT NULL,
  byte_count INTEGER NOT NULL,
  metadata TEXT NOT NULL,
  PRIMARY KEY(document_id,sequence),
  UNIQUE(document_id,operation_id)
);
CREATE TABLE IF NOT EXISTS document_history_payloads (
  document_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  part INTEGER NOT NULL,
  state BLOB NOT NULL,
  PRIMARY KEY(document_id,sequence,part)
);
CREATE TABLE IF NOT EXISTS document_history_operations (
  document_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  revision TEXT NOT NULL,
  PRIMARY KEY(document_id,operation_id)
);
`;

const historyError = (code: string, message: string) => new CollaborationError(code, message, 409);

export function assertHistorySequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    throw new CollaborationError("INVALID_HISTORY_VERSION", "历史版本号无效", 400);
}

/** 正文提交方持有事务和逐文档写入权，历史随同一提交落盘。 */
export class DocumentHistoryStore {
  constructor(private readonly sql: DocumentHistorySql) {}

  head(id: string): HistoryRow | undefined {
    return this.sql.all<HistoryRow>(
      "SELECT * FROM document_history_entries WHERE document_id=? ORDER BY sequence DESC LIMIT 1",
      id
    )[0];
  }

  list(id: string, before = Number.MAX_SAFE_INTEGER): DocumentHistoryEntry[] {
    assertHistorySequence(before);
    return this.sql
      .all<HistoryRow>(
        `SELECT metadata FROM document_history_entries WHERE document_id=? AND sequence<?
       ORDER BY sequence DESC LIMIT 50`,
        id,
        before
      )
      .map(row => JSON.parse(row.metadata) as DocumentHistoryEntry);
  }

  entriesAfter(id: string, sequence: number): DocumentHistoryEntry[] {
    return this.sql
      .all<HistoryRow>(
        "SELECT metadata FROM document_history_entries WHERE document_id=? AND sequence>? ORDER BY sequence LIMIT 50",
        id,
        sequence
      )
      .map(row => JSON.parse(row.metadata) as DocumentHistoryEntry);
  }

  entry(id: string, sequence: number): DocumentHistoryEntry {
    assertHistorySequence(sequence);
    const row = this.sql.all<HistoryRow>(
      "SELECT metadata FROM document_history_entries WHERE document_id=? AND sequence=?",
      id,
      sequence
    )[0];
    if (!row) throw historyError("HISTORY_NOT_FOUND", "该历史版本已不可用");
    return JSON.parse(row.metadata) as DocumentHistoryEntry;
  }

  operation(id: string, operationId: string): DocumentHistoryEntry | undefined {
    const row = this.sql.all<HistoryRow>(
      "SELECT metadata FROM document_history_entries WHERE document_id=? AND operation_id=?",
      id,
      operationId
    )[0];
    if (row) return JSON.parse(row.metadata) as DocumentHistoryEntry;
    // 被合并掉的提交不再占独立版本，但仍需能认出它已写入（重复送达与导入去重）
    const merged = this.savedOperation(id, operationId);
    return merged && this.entry(id, merged.sequence);
  }

  undone(id: string, sequence: number): boolean {
    return (
      this.sql.all(
        `SELECT 1 FROM document_history_entries WHERE document_id=? AND sequence>?
       AND json_extract(metadata,'$.kind')='undo' AND json_extract(metadata,'$.target')=? LIMIT 1`,
        id,
        sequence,
        sequence
      ).length > 0
    );
  }

  remove(id: string): void {
    this.sql.exec("DELETE FROM document_history_payloads WHERE document_id=?", id);
    this.sql.exec("DELETE FROM document_history_operations WHERE document_id=?", id);
    this.sql.exec("DELETE FROM document_history_entries WHERE document_id=?", id);
  }

  exportVersion(id: string, sequence: number): TransferredDocumentHistoryVersion {
    const head = this.sql.all<HistoryRow>(
      "SELECT * FROM document_history_entries WHERE document_id=? AND sequence=?",
      id,
      sequence
    )[0];
    if (!head) throw historyError("HISTORY_NOT_FOUND", "历史版本不存在");
    const storage = this.sql
      .all<HistoryPayloadPart>(
        "SELECT state FROM document_history_payloads WHERE document_id=? AND sequence=? ORDER BY part",
        id,
        sequence
      )
      .map(row =>
        bytesToBase64(row.state instanceof Uint8Array ? row.state : new Uint8Array(row.state))
      );
    if (!storage.length) throw historyError("HISTORY_INCOMPLETE", "历史版本数据不完整");
    return {
      entry: JSON.parse(head.metadata) as DocumentHistoryEntry,
      revision: head.revision,
      checkpoint: head.checkpoint,
      storage,
    };
  }

  importVersion(id: string, value: TransferredDocumentHistoryVersion): void {
    const { entry, revision, checkpoint, storage } = value;
    const head = this.head(id);
    if (
      !entry ||
      !["baseline", "edit", "undo", "restore"].includes(entry.kind) ||
      typeof entry.operationId !== "string" ||
      entry.operationId.length > 256 ||
      !Number.isSafeInteger(entry.time) ||
      typeof entry.actorId !== "string" ||
      typeof entry.actorName !== "string" ||
      !Number.isSafeInteger(entry.sequence) ||
      entry.sequence !== (head?.sequence ?? -1) + 1 ||
      (checkpoint !== entry.sequence && checkpoint !== head?.checkpoint) ||
      !/^[a-f0-9]{64}$/.test(revision) ||
      !Array.isArray(storage) ||
      storage.length === 0 ||
      storage.length > NODE_DOCUMENT_MAX_BYTES / PART_BYTES ||
      storage.some(
        part => typeof part !== "string" || part.length > Math.ceil((PART_BYTES * 4) / 3) + 4
      )
    )
      throw historyError("HISTORY_INCOMPLETE", "导入的历史版本不完整或顺序无效");
    const parts = storage.map(base64ToBytes);
    const total = parts.reduce((length, part) => length + part.byteLength, 0);
    if (total === 0 || total > NODE_DOCUMENT_MAX_BYTES)
      throw historyError("HISTORY_CAPACITY", "历史版本超过文档大小上限");
    const state = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      state.set(part, offset);
      offset += part.byteLength;
    }
    this.insert(id, revision, checkpoint, state, entry, head?.byte_count);
  }

  append(id: string, write: DocumentHistoryWrite): void {
    if (write.previousRevision === write.revision) return;
    const saved = this.savedOperation(id, write.operationId);
    if (saved) {
      if (saved.revision !== write.revision)
        throw historyError("HISTORY_IDENTITY_CONFLICT", "同一历史操作不能写入不同版本");
      return;
    }
    const now = write.time ?? Date.now();
    const head = this.head(id);
    const target = head && write.merge ? this.mergeTarget(id, head, write, now) : undefined;
    if (head && target) {
      this.merge(id, head, write, now, target);
      return;
    }
    let sequence = (head?.sequence ?? -1) + 1;
    const reset = head?.revision !== write.previousRevision;
    const seed = reset ? write.before() : undefined;
    const checkpoint =
      !reset &&
      head &&
      (sequence - head.checkpoint >= CHECKPOINT_INTERVAL ||
        head.byte_count + write.update.byteLength >= CHECKPOINT_REPLAY_BYTES);
    const state = checkpoint ? write.after() : write.update;
    write.checkBytes?.(state.byteLength + (seed?.byteLength ?? 0) + 1024);
    if (seed) {
      this.insert(id, write.previousRevision, sequence, seed, {
        sequence,
        operationId: `baseline:${sequence}`,
        time: now,
        actorId: "",
        actorName: "",
        kind: "baseline",
      });
      sequence++;
    }
    this.insert(
      id,
      write.revision,
      checkpoint ? sequence : reset ? sequence - 1 : (head?.checkpoint ?? 0),
      state,
      {
        ...write.actor,
        sequence,
        operationId: write.operationId,
        time: now,
        kind: write.kind ?? "edit",
        target: write.target,
        sourceRevision: write.sourceRevision,
      },
      checkpoint || reset ? 0 : head?.byte_count
    );
  }

  /** 连续编辑的合并判定：同作者、同来源、未停顿、未越过回放与容量预算。 */
  private mergeTarget(
    id: string,
    head: HistoryRow,
    write: DocumentHistoryWrite,
    now: number
  ): { lastPart: number } | undefined {
    if (head.revision !== write.previousRevision || write.update.byteLength === 0) return undefined;
    if ((write.kind ?? "edit") !== "edit") return undefined;
    const entry = JSON.parse(head.metadata) as DocumentHistoryEntry;
    if (entry.kind !== "edit") return undefined;
    if (entry.actorId !== write.actor.actorId || entry.source !== write.actor.source)
      return undefined;
    if (now < entry.time || now - entry.time > HISTORY_MERGE_IDLE_MS) return undefined;
    if (now - (entry.firstTime ?? entry.time) > HISTORY_MERGE_SPAN_MS) return undefined;
    if ((entry.mergedCount ?? 0) >= HISTORY_MERGE_MAX_UPDATES) return undefined;
    const payload = this.sql.all<{ total: number; last: number | null }>(
      `SELECT COALESCE(SUM(length(state)),0) AS total, MAX(part) AS last
       FROM document_history_payloads WHERE document_id=? AND sequence=?`,
      id,
      head.sequence
    )[0];
    if (!payload) return undefined;
    // 合并不再新增版本号，必须自己守住检查点触发阈值，回放成本才不被绕过
    const replayBytes = head.checkpoint === head.sequence ? payload.total : head.byte_count;
    if (replayBytes + write.update.byteLength > CHECKPOINT_REPLAY_BYTES) return undefined;
    if (payload.total + write.update.byteLength > NODE_DOCUMENT_MAX_BYTES) return undefined;
    return { lastPart: payload.last ?? -1 };
  }

  /** 并入 head：增量合进已有载荷，版本号、检查点与顺序不变。 */
  private merge(
    id: string,
    head: HistoryRow,
    write: DocumentHistoryWrite,
    now: number,
    target: { lastPart: number }
  ): void {
    const entry = JSON.parse(head.metadata) as DocumentHistoryEntry;
    const tail = this.payloadTail(id, head.sequence, target.lastPart);
    write.checkBytes?.(write.update.byteLength + (tail?.byteLength ?? 0) + 1024);
    // 同一版本的分片在回放时按原字节流拼接，两段独立增量不能用字节拼接，只能交给 Yjs 合并
    const state = tail ? Y.mergeUpdates([tail, write.update]) : write.update;
    const firstPart = tail ? target.lastPart : target.lastPart + 1;
    for (let offset = 0; offset < state.byteLength; offset += PART_BYTES) {
      const chunk = state.slice(offset, offset + PART_BYTES);
      const part = firstPart + offset / PART_BYTES;
      if (tail && offset === 0)
        this.sql.exec(
          "UPDATE document_history_payloads SET state=? WHERE document_id=? AND sequence=? AND part=?",
          chunk,
          id,
          head.sequence,
          part
        );
      else
        this.sql.exec(
          "INSERT INTO document_history_payloads VALUES (?,?,?,?)",
          id,
          head.sequence,
          part,
          chunk
        );
    }
    const merged: DocumentHistoryEntry = {
      ...entry,
      operationId: write.operationId,
      time: now,
      firstTime: entry.firstTime ?? entry.time,
      mergedCount: (entry.mergedCount ?? 0) + 1,
      sourceRevision: write.sourceRevision ?? entry.sourceRevision,
    };
    this.sql.exec(
      "UPDATE document_history_entries SET operation_id=?,revision=?,byte_count=?,metadata=? WHERE document_id=? AND sequence=?",
      write.operationId,
      write.revision,
      head.checkpoint === head.sequence ? 0 : head.byte_count + write.update.byteLength,
      JSON.stringify(merged),
      id,
      head.sequence
    );
    this.saveOperation(id, write.operationId, head.sequence, write.revision);
  }

  /** 末尾分片未写满时继续用它，避免每次合并多占一片（导出分片数有上限）。 */
  private payloadTail(id: string, sequence: number, lastPart: number): Uint8Array | undefined {
    if (lastPart < 0) return undefined;
    const row = this.sql.all<HistoryPayloadPart>(
      "SELECT state FROM document_history_payloads WHERE document_id=? AND sequence=? AND part=?",
      id,
      sequence,
      lastPart
    )[0];
    if (!row) return undefined;
    const bytes = row.state instanceof Uint8Array ? row.state : new Uint8Array(row.state);
    return bytes.byteLength < PART_BYTES ? bytes : undefined;
  }

  private savedOperation(
    id: string,
    operationId: string
  ): { sequence: number; revision: string } | undefined {
    const row = this.sql.all<{ sequence: number; revision: string }>(
      "SELECT sequence,revision FROM document_history_operations WHERE document_id=? AND operation_id=?",
      id,
      operationId
    )[0];
    return (
      row ??
      // 兼容尚未记录到操作表的存量版本
      this.sql.all<{ sequence: number; revision: string }>(
        "SELECT sequence,revision FROM document_history_entries WHERE document_id=? AND operation_id=?",
        id,
        operationId
      )[0]
    );
  }

  private saveOperation(id: string, operationId: string, sequence: number, revision: string): void {
    this.sql.exec(
      "INSERT INTO document_history_operations VALUES (?,?,?,?) ON CONFLICT(document_id,operation_id) DO NOTHING",
      id,
      operationId,
      sequence,
      revision
    );
  }

  private insert(
    id: string,
    revision: string,
    checkpoint: number,
    state: Uint8Array,
    entry: DocumentHistoryEntry,
    replayBytes = 0
  ): void {
    if (state.byteLength > NODE_DOCUMENT_MAX_BYTES)
      throw historyError("HISTORY_CAPACITY", "历史版本超过文档大小上限");
    this.sql.exec(
      "INSERT INTO document_history_entries VALUES (?,?,?,?,?,?,?)",
      id,
      entry.sequence,
      entry.operationId,
      revision,
      checkpoint,
      checkpoint === entry.sequence ? 0 : replayBytes + state.byteLength,
      JSON.stringify(entry)
    );
    for (let offset = 0; offset < state.byteLength; offset += PART_BYTES)
      this.sql.exec(
        "INSERT INTO document_history_payloads VALUES (?,?,?,?)",
        id,
        entry.sequence,
        offset / PART_BYTES,
        state.slice(offset, offset + PART_BYTES)
      );
    this.saveOperation(id, entry.operationId, entry.sequence, revision);
  }

  replay(id: string, sequence: number): Y.Doc {
    assertHistorySequence(sequence);
    const target = this.sql.all<{ checkpoint: number }>(
      "SELECT checkpoint FROM document_history_entries WHERE document_id=? AND sequence=?",
      id,
      sequence
    )[0];
    if (!target) throw historyError("HISTORY_NOT_FOUND", "该历史版本已不可用");
    const parts = this.sql.all<HistoryPayloadPart>(
      `SELECT sequence,part,state FROM document_history_payloads WHERE document_id=?
       AND sequence BETWEEN ? AND ? ORDER BY sequence,part`,
      id,
      target.checkpoint,
      sequence
    );
    const doc = new Y.Doc({ gc: false });
    try {
      let index = 0;
      for (let version = target.checkpoint; version <= sequence; version++) {
        const start = index;
        let size = 0;
        while (parts[index]?.sequence === version) {
          const part = parts[index];
          if (part.part !== index - start)
            throw historyError("HISTORY_INCOMPLETE", "历史版本数据不完整");
          size += part.state.byteLength;
          index++;
        }
        if (size === 0 || size > NODE_DOCUMENT_MAX_BYTES)
          throw historyError("HISTORY_INCOMPLETE", "历史版本数据不完整");
        const update = new Uint8Array(size);
        let offset = 0;
        for (let part = start; part < index; part++) {
          const value = parts[part].state;
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          update.set(bytes, offset);
          offset += bytes.byteLength;
        }
        Y.applyUpdate(doc, update);
        if (doc.store.pendingStructs || doc.store.pendingDs)
          throw historyError("HISTORY_INCOMPLETE", "历史版本缺少先行增量");
      }
      return doc;
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }

  preview(
    id: string,
    sequence: number,
    headRevision: string,
    actorId: string,
    owner: boolean,
    comparison?: Y.Doc
  ): DocumentHistoryPreview {
    return readDocumentHistoryPreview(this, id, sequence, headRevision, actorId, owner, comparison);
  }
}

export function readDocumentHistoryPreview(
  history: DocumentHistoryReader,
  id: string,
  sequence: number,
  headRevision: string,
  actorId: string,
  owner: boolean,
  comparison?: Y.Doc
): DocumentHistoryPreview {
  const entry = history.entry(id, sequence);
  const after = history.replay(id, sequence);
  let before: Y.Doc | undefined;
  try {
    const value = readNodeDocument(after);
    if (!comparison && entry.kind !== "baseline") before = history.replay(id, sequence - 1);
    const previousDoc = comparison ?? before;
    const previous = previousDoc && readNodeDocument(previousDoc);
    return {
      entry,
      value,
      previousTitle: previous?.title,
      changes: previous ? documentHistoryChanges(previous.content, value.content) : [],
      contracts: after.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
      headRevision,
      canRestore: owner,
      canUndo:
        entry.kind !== "baseline" &&
        (owner || entry.actorId === actorId) &&
        !history.undone(id, sequence),
    };
  } finally {
    before?.destroy();
    after.destroy();
  }
}

export function documentHistoryChanges(
  before: ContentNode[],
  after: ContentNode[]
): DocumentHistoryChange[] {
  const old = new Map(before.map(block => [String(block.collabId), block]));
  const next = new Map(after.map(block => [String(block.collabId), block]));
  const oldOrder = [...old.keys()].filter(id => next.has(id));
  const nextOrder = [...next.keys()].filter(id => old.has(id));
  const previous = new Map(oldOrder.map((id, index) => [id, index]));
  const changes: DocumentHistoryChange[] = [];
  for (const [blockId, block] of old)
    if (!next.has(blockId)) changes.push({ blockId, kind: "delete", before: block });
  for (const [blockId, block] of next) {
    const prior = old.get(blockId);
    if (!prior) changes.push({ blockId, kind: "insert", after: block });
    else if (!sharedValueEquals(prior, block))
      changes.push({ blockId, kind: "modify", before: prior, after: block });
  }
  for (const [index, blockId] of nextOrder.entries()) {
    if (previous.get(blockId) !== index)
      changes.push({ blockId, kind: "move", before: old.get(blockId), after: next.get(blockId) });
  }
  return changes;
}
