import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { Session } from "node:inspector";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type Database from "better-sqlite3";
import { InsightCandidateScheduler } from "../../src-electron/main/modules/topic-insights-candidate-client";
import { computeInsightCandidates } from "../../src-electron/main/modules/topic-insights-candidate-core";
import type {
  CandidateTask,
  CandidateSource,
} from "../../src-electron/main/modules/topic-insights-candidate-protocol";

export interface InsightBenchOptions {
  file: string;
  workerPath: string;
  sqliteModulePath: string;
  extensionPath: string;
  notes: number;
  prompts: number;
  dimensions: number;
  writes?: boolean;
  faultEvery?: number;
}

export function createInsightBench(options: InsightBenchOptions) {
  const NativeDatabase = createRequire(__filename)(options.sqliteModulePath) as typeof Database;
  const db = new NativeDatabase(options.file);
  db.loadExtension(options.extensionPath);
  db.pragma("journal_mode=WAL");
  db.exec(`CREATE TABLE vec_index_meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO vec_index_meta VALUES ('main_content_embedding_fingerprint', 'bench');
    CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT, updated_at REAL);
    CREATE TABLE content_sections (prefixed_id TEXT, update_time REAL, chunk_index INTEGER,
      heading_path TEXT, block_start INTEGER, text TEXT);
    CREATE VIRTUAL TABLE vec_documents USING vec0(prefixed_id TEXT, update_time FLOAT,
      content TEXT, type TEXT, chunk_index INTEGER,
      vec_embedding FLOAT[${options.dimensions}] distance_metric=cosine);`);
  let random = 712367;
  const vector = (axis: number) => {
    const value = new Float32Array(options.dimensions);
    for (let i = 0; i < value.length; i++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      value[i] = (random / 4294967296 - 0.5) * 0.004;
    }
    value[axis] = 1;
    return Buffer.from(value.buffer);
  };
  const insert = db.prepare(`INSERT INTO vec_documents
    (prefixed_id,update_time,content,type,chunk_index,vec_embedding) VALUES (?,?,'benchmark',?,0,?)`);
  db.transaction(() => {
    for (let i = 0; i < options.notes; i++) insert.run(`card:${i}`, i + 0.5, "card", vector(i % 4));
    for (let i = 0; i < options.prompts; i++)
      insert.run(`chat-prompt:bench#${i}`, i + 0.5, "chat-prompt", vector(4 + (i % 4)));
  })();
  db.pragma("wal_checkpoint(TRUNCATE)");
  const source: CandidateSource = {
    file: options.file,
    fingerprint: "bench",
    schemaVersion: Number(db.pragma("schema_version", { simple: true })),
  };
  const task: CandidateTask = {
    kind: "global",
    topics: [],
    links: [],
    concepts: [],
    threshold: 0.8,
    longDocs: [],
  };
  let profile: Session | undefined;
  let controller: AbortController | undefined;
  let cancelCurrent = false;
  let cancelled = 0;
  let opened: (() => void) | undefined;
  let active = false;
  let activeWorkers = 0;
  let maxActiveWorkers = 0;
  const scheduler = new InsightCandidateScheduler({
    workerPath: options.workerPath,
    sqliteModulePath: options.sqliteModulePath,
    onPhase: phase => {
      active = phase === "opened";
      activeWorkers = active ? activeWorkers + 1 : Math.max(0, activeWorkers - 1);
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      if (active) {
        opened?.();
        if (cancelCurrent) controller?.abort();
      }
    },
  });
  const loop = monitorEventLoopDelay({ resolution: 10 });
  let stop = true;
  let running: Promise<void> | undefined;
  let cycles = 0;
  let digest = "";
  let startedAt = 0;
  let writeTimer: ReturnType<typeof setInterval> | undefined;
  let writes = 0;
  let maxWriteMs = 0;
  const errors: string[] = [];
  const durations: number[] = [];
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return {
    async startProfile() {
      profile = new Session();
      profile.connect();
      const session = profile;
      await new Promise<void>((resolve, reject) =>
        session.post("Profiler.enable", error => (error ? reject(error) : resolve()))
      );
      await new Promise<void>((resolve, reject) =>
        session.post("Profiler.setSamplingInterval", { interval: 10000 }, error =>
          error ? reject(error) : resolve()
        )
      );
      await new Promise<void>((resolve, reject) =>
        session.post("Profiler.start", error => (error ? reject(error) : resolve()))
      );
    },
    async stopProfile() {
      const session = profile;
      if (!session) return;
      profile = undefined;
      try {
        return await new Promise<unknown>((resolve, reject) =>
          session.post("Profiler.stop", (error, value) =>
            error ? reject(error) : resolve(value.profile)
          )
        );
      } finally {
        session.disconnect();
      }
    },
    async parity() {
      const sync = await computeInsightCandidates(db, task);
      const worker = await scheduler.run(source, task);
      if (hash(sync) !== hash(worker)) throw new Error("主线程与真实 Worker 候选不一致");
      return {
        digest: hash(worker),
        groups: worker.asked.length,
        prompts: worker.asked.reduce((n, group) => n + group.times, 0),
      };
    },
    async start(mode: "idle" | "sync" | "worker") {
      if (!stop) throw new Error("压力任务尚未结束");
      stop = false;
      cycles = 0;
      cancelled = 0;
      activeWorkers = 0;
      maxActiveWorkers = 0;
      writes = 0;
      maxWriteMs = 0;
      errors.length = 0;
      durations.length = 0;
      loop.reset();
      loop.enable();
      startedAt = performance.now();
      if (mode === "idle") return;
      const ready = new Promise<void>(resolve => {
        opened = resolve;
      });
      if (options.writes)
        writeTimer = setInterval(() => {
          const at = performance.now();
          try {
            db.prepare("INSERT OR REPLACE INTO index_meta VALUES ('bench-write', ?, ?)").run(
              String(++writes),
              Date.now()
            );
            maxWriteMs = Math.max(maxWriteMs, performance.now() - at);
          } catch (error) {
            errors.push(String(error));
          }
        }, 50);
      running = (async () => {
        try {
          while (!stop) {
            const begin = performance.now();
            if (mode === "sync") {
              active = true;
              opened?.();
            }
            controller = new AbortController();
            cancelCurrent =
              mode === "worker" &&
              !!options.faultEvery &&
              (cycles + cancelled) % options.faultEvery === options.faultEvery - 1;
            let result;
            try {
              result =
                mode === "sync"
                  ? await computeInsightCandidates(db, task)
                  : await scheduler.run(source, task, controller.signal);
            } catch (error) {
              if (cancelCurrent && controller.signal.aborted) {
                cancelled++;
                continue;
              }
              throw error;
            }
            active = false;
            const next = hash(result);
            if (digest && digest !== next) throw new Error("同一冻结输入的候选发生漂移");
            digest = next;
            cycles++;
            durations.push(performance.now() - begin);
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
          opened?.();
        }
      })();
      await ready;
    },
    snapshot() {
      return {
        active,
        activeWorkers,
        maxActiveWorkers,
        cancelled,
        cycles,
        digest,
        errors: [...errors],
        durations: [...durations],
        elapsedMs: performance.now() - startedAt,
        loopP99Ms: loop.percentile(99) / 1e6,
        loopMaxMs: loop.max / 1e6,
        rssMB: process.memoryUsage().rss / 1048576,
        heapMB: process.memoryUsage().heapUsed / 1048576,
        writes,
        maxWriteMs,
      };
    },
    async finish() {
      stop = true;
      if (writeTimer) clearInterval(writeTimer);
      writeTimer = undefined;
      await running;
      running = undefined;
      loop.disable();
      const checkpoint = db.pragma("wal_checkpoint(TRUNCATE)");
      return {
        cycles,
        activeWorkers,
        maxActiveWorkers,
        cancelled,
        digest,
        errors: [...errors],
        durations: [...durations],
        writes,
        maxWriteMs,
        checkpoint,
      };
    },
    async dispose() {
      stop = true;
      if (writeTimer) clearInterval(writeTimer);
      await running;
      await scheduler.pause();
      profile?.disconnect();
      loop.disable();
      db.close();
    },
  };
}
