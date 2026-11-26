import type Database from "better-sqlite3";
import { runCheckpointWorker } from "./checkpoint-worker";
import { alternateWhiteboardDatabaseName } from "@/types/whiteboard-document";
import { WHITEBOARD_LIMITS, type DocumentProtocol } from "@tau/collaboration";
import { WhiteboardJournal, journalKey, stateHash, type WhiteboardCheckpoint } from "./journal";
import type { CompactInput } from "../../workers/whiteboard-compact.worker";
import { WhiteboardDocumentRepository } from "./repository";

export const reclaimThreshold = WHITEBOARD_LIMITS.documentBytes / 2;

interface Checkpoint extends WhiteboardCheckpoint {
  key: string;
  confirmed?: DocumentProtocol;
  db: Database.Database;
}

// 排队只保存身份与修订，同一时刻仅一块冷白板占用工作线程和完整快照。
export class IdleWhiteboardReclaims {
  private pending = new Map<string, Checkpoint>();
  private current?: { job: Checkpoint; controller: AbortController };
  private running = false;
  constructor(
    private readonly journal: WhiteboardJournal,
    private readonly idle: (job: Checkpoint) => boolean
  ) {}
  schedule(db: Database.Database, value: WhiteboardCheckpoint, confirmed?: DocumentProtocol) {
    const { databaseName, documentId, sourceId, baselineId, epoch, revision, hash } = value;
    this.pending.set(JSON.stringify([databaseName, documentId]), {
      key: journalKey(value),
      confirmed,
      db,
      databaseName,
      documentId,
      sourceId,
      baselineId,
      epoch,
      revision,
      hash,
    });
    if (!this.running) setImmediate(() => void this.drain());
  }
  cancel(databaseName: string, documentId: string) {
    for (const name of [databaseName, alternateWhiteboardDatabaseName(databaseName)]) {
      this.pending.delete(JSON.stringify([name, documentId]));
      if (this.current?.job.databaseName === name && this.current.job.documentId === documentId)
        this.current.controller.abort();
    }
  }
  clear() {
    this.pending.clear();
    this.current?.controller.abort();
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (const [key, job] of this.pending) {
        this.pending.delete(key);
        const controller = new AbortController();
        this.current = { job, controller };
        try {
          await this.reclaim(job, controller.signal);
        } catch (error) {
          console.warn(
            "[whiteboard-reclaim]",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } finally {
      this.running = false;
      this.current = undefined;
    }
  }
  private async reclaim(job: Checkpoint, signal: AbortSignal) {
    if (!this.idle(job)) return;
    const { db, key, ...previous } = job;
    const input: CompactInput = db.memory
      ? { ...previous, state: this.journal.load(key)?.state ?? new Uint8Array() }
      : { ...previous, file: db.name };
    const bytes = await runCheckpointWorker(input, signal);
    if (!bytes || signal.aborted || !this.idle(job)) return;
    const repo = new WhiteboardDocumentRepository(db, job.databaseName);
    const hash = stateHash(bytes);
    if (!this.journal.prepareReclaim(previous, hash)) return;
    repo.installReclaim(previous, bytes, hash);
    this.journal.finishReclaim({ ...previous, epoch: previous.epoch + 1, hash, state: bytes });
  }
}
