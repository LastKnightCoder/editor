import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { sqliteVecExtensionPath } from "../utils/sqlite-vec-path";
import { recordStage } from "./perf-record";
import type {
  CandidateInput,
  CandidateKind,
  CandidateResults,
  CandidateSource,
  CandidateWorkerInput,
  CandidateWorkerResult,
  CandidateWorkerMessage,
} from "./topic-insights-candidate-protocol";

interface CandidateJob {
  file: string;
  cancel: AbortController;
  done: Promise<unknown>;
  active: boolean;
}

export class InsightCandidateScheduler {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly jobs = new Set<CandidateJob>();
  private readonly barriers = new Map<string, number>();
  private allBarriers = 0;

  constructor(
    private readonly options: {
      workerPath?: string;
      sqliteModulePath?: string;
      onPhase?: (phase: "opened" | "closed", kind: CandidateKind) => void;
    } = {}
  ) {}

  readonly run = <K extends CandidateKind>(
    source: CandidateSource,
    task: CandidateInput<K>,
    signal?: AbortSignal
  ): Promise<CandidateResults[K]> => {
    const file = resolve(source.file);
    const cancel = new AbortController();
    const abort = () => cancel.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) cancel.abort();
    const queuedAt = performance.now();
    const job: CandidateJob = { file, cancel, done: Promise.resolve(), active: false };
    const next = this.tail.then(async () => {
      cancel.signal.throwIfAborted();
      if (this.allBarriers || this.barriers.has(file))
        throw new Error("资料库正在维护，请稍后重试分析");
      recordStage("insights:queue", performance.now() - queuedAt);
      const flag = new Int32Array(new SharedArrayBuffer(4));
      const cancelWorker = () => Atomics.store(flag, 0, 1);
      cancel.signal.addEventListener("abort", cancelWorker, { once: true });
      if (cancel.signal.aborted) cancelWorker();
      const started = performance.now();
      job.active = true;
      try {
        const input: CandidateWorkerInput = {
          source,
          task,
          cancel: flag.buffer as SharedArrayBuffer,
          extensionPath: sqliteVecExtensionPath(),
          sqliteModulePath:
            this.options.sqliteModulePath ?? createRequire(__filename).resolve("better-sqlite3"),
        };
        const result = await new Promise<CandidateWorkerResult>((resolveResult, reject) => {
          const worker = new Worker(
            this.options.workerPath ?? join(__dirname, "topic-insights-candidate-worker.js"),
            { workerData: input }
          );
          let result: CandidateWorkerResult | undefined;
          let failure: Error | undefined;
          worker.on("message", (value: CandidateWorkerMessage) => {
            if ("phase" in value) this.options.onPhase?.(value.phase, task.kind);
            else result = value;
          });
          worker.once("error", error => {
            failure = error;
          });
          worker.once("exit", code => {
            this.options.onPhase?.("closed", task.kind);
            if (failure) reject(failure);
            else if (code !== 0 || !result) reject(new Error(`洞察候选线程异常退出（${code}）`));
            else resolveResult(result);
          });
        });
        cancel.signal.throwIfAborted();
        if (!result.ok) throw new Error(result.message);
        if (result.kind !== task.kind) throw new Error("洞察候选回执不匹配");
        for (const stage of result.stages) recordStage(`insights:${stage.label}`, stage.ms);
        return result.result as CandidateResults[K];
      } finally {
        job.active = false;
        cancel.signal.removeEventListener("abort", cancelWorker);
        recordStage(`insights:${task.kind}:total`, performance.now() - started);
      }
    });
    job.done = next;
    this.jobs.add(job);
    this.tail = next.catch(() => undefined);
    return next.finally(() => {
      this.jobs.delete(job);
      signal?.removeEventListener("abort", abort);
    });
  };

  async pause(file?: string): Promise<() => void> {
    const key = file === undefined ? undefined : resolve(file);
    if (key === undefined) this.allBarriers++;
    else this.barriers.set(key, (this.barriers.get(key) ?? 0) + 1);
    const jobs = [...this.jobs].filter(job => key === undefined || job.file === key);
    for (const job of jobs) job.cancel.abort();
    await Promise.allSettled(jobs.filter(job => job.active).map(job => job.done));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (key === undefined) this.allBarriers--;
      else {
        const count = (this.barriers.get(key) ?? 1) - 1;
        if (count) this.barriers.set(key, count);
        else this.barriers.delete(key);
      }
    };
  }
}

export const insightCandidateScheduler = new InsightCandidateScheduler();
