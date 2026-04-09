import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  MemoryCheckpointState,
  MemoryJobStatus,
  MemorySourceType,
  MemoryStatus,
  MemoryStatusSummary,
} from "@/types";
import {
  ensureMemoryDbDir,
  getMemoryManifestPath,
  getMemoryPalacePath,
  getMemoryStateDbPath,
} from "./utils/memory-storage";

const DEFAULT_SUMMARY: MemoryStatusSummary = {
  total: 0,
  pending: 0,
  running: 0,
  done: 0,
  failed: 0,
  stale: 0,
};

export interface MemoryCheckpointRecord {
  sourceType: MemorySourceType;
  sourceId: number;
  sourceVersion: number;
  archiveHash: string;
  archiveState: MemoryCheckpointState;
  lastArchivedAt?: number | null;
  lastError?: string | null;
}

export interface MemoryJobRecord {
  id: string;
  jobType: string;
  mainDbName: string;
  status: MemoryJobStatus;
  totalCount: number;
  processedCount: number;
  failedCount: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number | null;
}

class MemoryStateDbManager {
  private databases = new Map<string, Database.Database>();

  ensureReady(mainDbName: string): Database.Database {
    const existing = this.databases.get(mainDbName);
    if (existing) {
      return existing;
    }

    ensureMemoryDbDir(mainDbName);
    const dbPath = getMemoryStateDbPath(mainDbName);
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS source_checkpoint (
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        source_version INTEGER NOT NULL,
        archive_hash TEXT NOT NULL,
        archive_state TEXT NOT NULL,
        last_archived_at INTEGER,
        last_error TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (source_type, source_id)
      );

      CREATE TABLE IF NOT EXISTS source_drawer_map (
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        source_version INTEGER NOT NULL,
        drawer_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        room TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (drawer_id)
      );

      CREATE INDEX IF NOT EXISTS idx_source_drawer_map_source
      ON source_drawer_map(source_type, source_id);

      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        main_db_name TEXT NOT NULL,
        status TEXT NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS job_items (
        job_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        item_state TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        locked_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (job_id, source_type, source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_job_items_state ON job_items(job_id, item_state);
    `);

    this.ensureManifest(mainDbName);
    this.databases.set(mainDbName, db);
    return db;
  }

  closeDatabase(mainDbName: string): void {
    const db = this.databases.get(mainDbName);
    if (!db) {
      return;
    }
    db.close();
    this.databases.delete(mainDbName);
  }

  getDatabase(mainDbName: string): Database.Database | undefined {
    return this.databases.get(mainDbName);
  }

  ensureManifest(mainDbName: string): void {
    const manifestPath = getMemoryManifestPath(mainDbName);
    if (existsSync(manifestPath)) {
      return;
    }
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          mainDbName,
          palacePath: getMemoryPalacePath(mainDbName),
          stateDbPath: getMemoryStateDbPath(mainDbName),
          createdAt: Date.now(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  markRunningJobsInterrupted(mainDbName: string): number {
    const db = this.ensureReady(mainDbName);
    const now = Date.now();
    const result = db
      .prepare(
        `UPDATE jobs
         SET status = 'interrupted', updated_at = ?, finished_at = COALESCE(finished_at, ?)
         WHERE main_db_name = ? AND status = 'running'`,
      )
      .run(now, now, mainDbName);
    return result.changes;
  }

  getCheckpoint(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceId: number,
  ): MemoryCheckpointRecord | null {
    const db = this.ensureReady(mainDbName);
    const row = db
      .prepare(
        `SELECT * FROM source_checkpoint WHERE source_type = ? AND source_id = ?`,
      )
      .get(sourceType, sourceId) as
      | {
          source_type: MemorySourceType;
          source_id: number;
          source_version: number;
          archive_hash: string;
          archive_state: MemoryCheckpointState;
          last_archived_at?: number | null;
          last_error?: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      sourceType: row.source_type,
      sourceId: Number(row.source_id),
      sourceVersion: Number(row.source_version),
      archiveHash: row.archive_hash,
      archiveState: row.archive_state,
      lastArchivedAt: row.last_archived_at ?? null,
      lastError: row.last_error ?? null,
    };
  }

  upsertCheckpoint(mainDbName: string, record: MemoryCheckpointRecord): void {
    const db = this.ensureReady(mainDbName);
    const now = Date.now();
    db.prepare(
      `INSERT INTO source_checkpoint (
        source_type, source_id, source_version, archive_hash, archive_state,
        last_archived_at, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_type, source_id) DO UPDATE SET
        source_version = excluded.source_version,
        archive_hash = excluded.archive_hash,
        archive_state = excluded.archive_state,
        last_archived_at = excluded.last_archived_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at`,
    ).run(
      record.sourceType,
      record.sourceId,
      record.sourceVersion,
      record.archiveHash,
      record.archiveState,
      record.lastArchivedAt ?? null,
      record.lastError ?? null,
      now,
    );
  }

  replaceDrawerMappings(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceId: number,
    sourceVersion: number,
    mappings: Array<{
      drawerId: string;
      chunkIndex: number;
      room: string;
      contentHash: string;
    }>,
  ): void {
    const db = this.ensureReady(mainDbName);
    const tx = db.transaction(() => {
      db.prepare(
        `DELETE FROM source_drawer_map WHERE source_type = ? AND source_id = ?`,
      ).run(sourceType, sourceId);
      const stmt = db.prepare(
        `INSERT INTO source_drawer_map (
          source_type, source_id, source_version, drawer_id, chunk_index, room, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const now = Date.now();
      for (const item of mappings) {
        stmt.run(
          sourceType,
          sourceId,
          sourceVersion,
          item.drawerId,
          item.chunkIndex,
          item.room,
          item.contentHash,
          now,
        );
      }
    });
    tx();
  }

  getDrawerIdsForSource(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceId: number,
  ): string[] {
    const db = this.ensureReady(mainDbName);
    const rows = db
      .prepare(
        `SELECT drawer_id FROM source_drawer_map WHERE source_type = ? AND source_id = ? ORDER BY chunk_index ASC`,
      )
      .all(sourceType, sourceId) as Array<{ drawer_id: string }>;
    return rows.map((row) => row.drawer_id);
  }

  clearSource(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceId: number,
  ): void {
    const db = this.ensureReady(mainDbName);
    const tx = db.transaction(() => {
      db.prepare(
        `DELETE FROM source_drawer_map WHERE source_type = ? AND source_id = ?`,
      ).run(sourceType, sourceId);
      db.prepare(
        `DELETE FROM source_checkpoint WHERE source_type = ? AND source_id = ?`,
      ).run(sourceType, sourceId);
    });
    tx();
  }

  markSourceStale(
    mainDbName: string,
    sourceType: MemorySourceType,
    sourceId: number,
    lastError?: string | null,
  ): void {
    const db = this.ensureReady(mainDbName);
    db.prepare(
      `UPDATE source_checkpoint
       SET archive_state = 'stale',
           last_error = ?,
           updated_at = ?
       WHERE source_type = ? AND source_id = ?`,
    ).run(lastError ?? null, Date.now(), sourceType, sourceId);
  }

  startJob(
    mainDbName: string,
    jobId: string,
    jobType: string,
    totalCount: number,
  ): void {
    const db = this.ensureReady(mainDbName);
    const now = Date.now();
    db.prepare(
      `INSERT INTO jobs (
        job_id, job_type, main_db_name, status, total_count, processed_count, failed_count, started_at, updated_at
      ) VALUES (?, ?, ?, 'running', ?, 0, 0, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        status = 'running',
        total_count = excluded.total_count,
        processed_count = 0,
        failed_count = 0,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        finished_at = NULL`,
    ).run(jobId, jobType, mainDbName, totalCount, now, now);
  }

  upsertJobItem(
    mainDbName: string,
    jobId: string,
    sourceType: MemorySourceType,
    sourceId: number,
    itemState: MemoryJobStatus | "done",
    lastError?: string | null,
  ): void {
    const db = this.ensureReady(mainDbName);
    const now = Date.now();
    db.prepare(
      `INSERT INTO job_items (
        job_id, source_type, source_id, item_state, attempt_count, last_error, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(job_id, source_type, source_id) DO UPDATE SET
        item_state = excluded.item_state,
        attempt_count = job_items.attempt_count + 1,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at`,
    ).run(jobId, sourceType, sourceId, itemState, lastError ?? null, now);
  }

  finishJob(
    mainDbName: string,
    jobId: string,
    status: Extract<MemoryJobStatus, "completed" | "failed" | "cancelled">,
    processedCount: number,
    failedCount: number,
  ): void {
    const db = this.ensureReady(mainDbName);
    const now = Date.now();
    db.prepare(
      `UPDATE jobs
       SET status = ?, processed_count = ?, failed_count = ?, updated_at = ?, finished_at = ?
       WHERE job_id = ? AND main_db_name = ?`,
    ).run(status, processedCount, failedCount, now, now, jobId, mainDbName);
  }

  summarize(mainDbName: string): MemoryStatus {
    const db = this.ensureReady(mainDbName);
    const summaries: Record<MemorySourceType, MemoryStatusSummary> = {
      chat: { ...DEFAULT_SUMMARY },
      diary: { ...DEFAULT_SUMMARY },
    };

    const rows = db
      .prepare(
        `SELECT source_type, archive_state, COUNT(*) as count
         FROM source_checkpoint
         GROUP BY source_type, archive_state`,
      )
      .all() as Array<{
      source_type: MemorySourceType;
      archive_state: MemoryCheckpointState;
      count: number;
    }>;

    for (const row of rows) {
      const target = summaries[row.source_type];
      if (!target) {
        continue;
      }
      target.total += Number(row.count);
      target[row.archive_state] += Number(row.count);
    }

    const runningJobs =
      (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM jobs WHERE main_db_name = ? AND status = 'running'`,
          )
          .get(mainDbName) as { count: number } | undefined
      )?.count ?? 0;
    const interruptedJobs =
      (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM jobs WHERE main_db_name = ? AND status = 'interrupted'`,
          )
          .get(mainDbName) as { count: number } | undefined
      )?.count ?? 0;

    return {
      available: true,
      mainDbName,
      rootDir: ensureMemoryDbDir(mainDbName),
      palacePath: getMemoryPalacePath(mainDbName),
      stateDbPath: getMemoryStateDbPath(mainDbName),
      summaries,
      runningJobs: Number(runningJobs),
      interruptedJobs: Number(interruptedJobs),
    };
  }
}

export default new MemoryStateDbManager();
