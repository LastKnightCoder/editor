import * as Y from "yjs";
import historyPolicy from "@tau/db-schema/document-history-policy.json";
import { NODE_DOCUMENT_MAX_BYTES, readNodeDocument } from "./node-document";
import { CollaborationError, type ContentNode, type SharedContent } from "./protocol";
import { sharedValueEquals } from "./shared-values";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { base64ToBytes, bytesToBase64 } from "./encoding";

export interface DocumentHistoryEntry {
  sequence: number;
  operationId: string;
  versionKey?: string;
  groupOperationId?: string;
  actorId: string;
  actorName: string;
  /** 合并记录中最后一次编辑的时间 */
  time: number;
  /** 合并了多次编辑时的首次编辑时间 */
  startTime?: number;
  /** 已封口：之后的编辑另开记录 */
  sealed?: boolean;
  kind: "baseline" | "edit" | "undo" | "restore";
  target?: number;
  source?: string;
  sourceRevision?: string;
  targetVersion?: string;
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
  matchesCurrent?: boolean;
  canRestore: boolean;
  canUndo: boolean;
}

export interface DocumentHistoryReader {
  entry(id: string, sequence: number): DocumentHistoryEntry;
  replay(id: string, sequence: number): Y.Doc;
  previousSequence?(id: string, sequence: number): number;
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
const CHECKPOINT_INTERVAL = historyPolicy.checkpointVersions;
const CHECKPOINT_REPLAY_BYTES = historyPolicy.checkpointReplayBytes;
/** 同一来源连续编辑合并为一条：停顿超过此值另开记录 */
export const HISTORY_MERGE_IDLE_MS = 5 * 60_000;
/** 一条合并记录从首次编辑起最长覆盖的时间 */
export const HISTORY_MERGE_SPAN_MS = 30 * 60_000;

/** 判断新编辑能否并入最新记录；撤销、恢复、基线与其他来源始终另起一条。 */
export function canMergeHistoryEntry(
  head: Pick<DocumentHistoryEntry, "kind" | "actorId" | "source" | "time" | "startTime" | "sealed">,
  write: Pick<DocumentHistoryEntry, "kind" | "actorId" | "source" | "time"> & {
    target?: number;
  }
): boolean {
  const idle = write.time - head.time;
  return (
    head.kind === "edit" &&
    !head.sealed &&
    write.kind === "edit" &&
    write.target === undefined &&
    head.actorId === write.actorId &&
    (head.source ?? "") === (write.source ?? "") &&
    idle >= 0 &&
    idle <= HISTORY_MERGE_IDLE_MS &&
    write.time - (head.startTime ?? head.time) <= HISTORY_MERGE_SPAN_MS
  );
}

export interface DocumentHistoryWrite {
  operationId: string;
  actor: DocumentHistoryActor;
  kind?: "edit" | "restore" | "undo";
  target?: number;
  time?: number;
  sourceRevision?: string;
  targetVersion?: string;
  previousRevision: string;
  revision: string;
  update: Uint8Array;
  before: () => Uint8Array;
  after: () => Uint8Array;
  checkBytes?: (bytes: number) => void;
  /** false：另起一条且之后不再并入（按序号或操作 ID 对账的记录不能被事后改写） */
  mergeable?: boolean;
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
    return row && (JSON.parse(row.metadata) as DocumentHistoryEntry);
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

  /** 已查看的版本和结束的编辑会话不再接受后续合并。 */
  seal(id: string, options: { sequence?: number; actorId?: string } = {}): void {
    const values: SqlValue[] = [id];
    let target =
      "sequence=(SELECT MAX(sequence) FROM document_history_entries WHERE document_id=?)";
    if (options.sequence !== undefined) {
      assertHistorySequence(options.sequence);
      target = "sequence=?";
      values.push(options.sequence);
    } else values.push(id);
    if (options.actorId !== undefined) values.push(options.actorId);
    this.sql.exec(
      `UPDATE document_history_entries SET metadata=json_set(metadata,'$.sealed',json('true'))
       WHERE document_id=? AND ${target}
       AND json_extract(metadata,'$.kind')='edit'
       ${options.actorId === undefined ? "" : "AND json_extract(metadata,'$.actorId')=?"}`,
      ...values
    );
  }

  remove(id: string): void {
    this.sql.exec("DELETE FROM document_history_payloads WHERE document_id=?", id);
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
    const saved = this.sql.all<{ revision: string }>(
      "SELECT revision FROM document_history_entries WHERE document_id=? AND operation_id=?",
      id,
      write.operationId
    )[0];
    if (saved) {
      if (saved.revision !== write.revision)
        throw historyError("HISTORY_IDENTITY_CONFLICT", "同一历史操作不能写入不同版本");
      return;
    }
    const now = write.time ?? Date.now();
    const head = this.head(id);
    // 检查点记录存完整状态，不再并入：避免每次输入重写整篇
    if (
      write.mergeable !== false &&
      head &&
      head.revision === write.previousRevision &&
      head.checkpoint !== head.sequence
    ) {
      const entry = JSON.parse(head.metadata) as DocumentHistoryEntry;
      if (
        canMergeHistoryEntry(entry, {
          ...write.actor,
          kind: write.kind ?? "edit",
          target: write.target,
          time: now,
        })
      )
        return this.merge(id, head, entry, write, now);
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
        ...(write.targetVersion && { targetVersion: write.targetVersion }),
        sourceRevision: write.sourceRevision,
        ...(write.mergeable === false && { sealed: true }),
      },
      checkpoint || reset ? 0 : head?.byte_count
    );
  }

  private merge(
    id: string,
    head: HistoryRow,
    entry: DocumentHistoryEntry,
    write: DocumentHistoryWrite,
    now: number
  ): void {
    const previous = this.payload(id, head.sequence);
    let state = Y.mergeUpdates([previous, write.update]);
    let replayBytes = head.byte_count - previous.byteLength + state.byteLength;
    let checkpoint = head.checkpoint;
    if (replayBytes >= CHECKPOINT_REPLAY_BYTES) {
      // 回放量超限：本条改存完整状态并成为检查点，之后的编辑另开记录
      state = write.after();
      checkpoint = head.sequence;
      replayBytes = 0;
    }
    write.checkBytes?.(Math.max(0, state.byteLength - previous.byteLength) + 1024);
    if (state.byteLength > NODE_DOCUMENT_MAX_BYTES)
      throw historyError("HISTORY_CAPACITY", "历史版本超过文档大小上限");
    this.sql.exec(
      "DELETE FROM document_history_payloads WHERE document_id=? AND sequence=?",
      id,
      head.sequence
    );
    // 操作 ID 换成最近一次写入的，使同一写入重试仍按幂等识别
    this.sql.exec(
      `UPDATE document_history_entries SET operation_id=?,revision=?,checkpoint=?,byte_count=?,metadata=?
       WHERE document_id=? AND sequence=?`,
      write.operationId,
      write.revision,
      checkpoint,
      replayBytes,
      JSON.stringify({
        ...entry,
        groupOperationId: entry.groupOperationId ?? entry.operationId,
        operationId: write.operationId,
        time: now,
        startTime: entry.startTime ?? entry.time,
        sourceRevision: write.sourceRevision ?? entry.sourceRevision,
      }),
      id,
      head.sequence
    );
    this.writeParts(id, head.sequence, state);
  }

  private payload(id: string, sequence: number): Uint8Array {
    const parts = this.sql
      .all<HistoryPayloadPart>(
        "SELECT state FROM document_history_payloads WHERE document_id=? AND sequence=? ORDER BY part",
        id,
        sequence
      )
      .map(row => (row.state instanceof Uint8Array ? row.state : new Uint8Array(row.state)));
    const bytes = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    if (!bytes.byteLength) throw historyError("HISTORY_INCOMPLETE", "历史版本数据不完整");
    return bytes;
  }

  private writeParts(id: string, sequence: number, state: Uint8Array): void {
    for (let offset = 0; offset < state.byteLength; offset += PART_BYTES)
      this.sql.exec(
        "INSERT INTO document_history_payloads VALUES (?,?,?,?)",
        id,
        sequence,
        offset / PART_BYTES,
        state.slice(offset, offset + PART_BYTES)
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
    this.writeParts(id, entry.sequence, state);
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
    this.seal(id, { sequence });
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
  comparison?: Y.Doc,
  current?: Y.Doc
): DocumentHistoryPreview {
  const entry = history.entry(id, sequence);
  const after = history.replay(id, sequence);
  let before: Y.Doc | undefined;
  try {
    const value = readNodeDocument(after);
    if (!comparison && entry.kind !== "baseline")
      before = history.replay(id, history.previousSequence?.(id, sequence) ?? sequence - 1);
    const previousDoc = comparison ?? before;
    const previous = previousDoc && readNodeDocument(previousDoc);
    return {
      entry,
      value,
      previousTitle: previous?.title,
      changes: previous ? documentHistoryChanges(previous.content, value.content) : [],
      contracts: after.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
      headRevision,
      ...(current && { matchesCurrent: sharedValueEquals(value, readNodeDocument(current)) }),
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
      changes.push({
        blockId,
        kind: "move",
        before: old.get(blockId),
        after: next.get(blockId),
      });
  }
  return changes;
}
