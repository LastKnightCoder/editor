import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";
import { computeInsightCandidates } from "../modules/topic-insights-candidate-core";
import { readEmbeddingFingerprint } from "../modules/entity-context/related-threshold";
import type {
  CandidateWorkerInput,
  CandidateWorkerResult,
} from "../modules/topic-insights-candidate-protocol";

const input: CandidateWorkerInput = workerData;
const cancel = new Int32Array(input.cancel);
const check = () => {
  if (Atomics.load(cancel, 0)) throw new DOMException("洞察候选计算已取消", "AbortError");
};

async function run(): Promise<CandidateWorkerResult> {
  const stages: Array<{ label: string; ms: number }> = [];
  const stage = async <T>(label: string, fn: () => T | Promise<T>) => {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      stages.push({ label, ms: performance.now() - start });
    }
  };
  const start = performance.now();
  const Database = createRequire(__filename)(
    input.sqliteModulePath
  ) as typeof import("better-sqlite3");
  check();
  const db = new Database(input.source.file, { readonly: true, fileMustExist: true });
  try {
    db.loadExtension(input.extensionPath);
    db.pragma("query_only = ON");
    db.exec("BEGIN");
    if (
      readEmbeddingFingerprint(db) !== input.source.fingerprint ||
      db.pragma("schema_version", { simple: true }) !== input.source.schemaVersion
    )
      throw new Error("洞察索引已变化，请重新分析");
    stages.push({ label: "open", ms: performance.now() - start });
    parentPort?.postMessage({ phase: "opened", kind: input.task.kind });
    const result = await computeInsightCandidates(db, input.task, check, stage);
    check();
    db.exec("COMMIT");
    return { ok: true, kind: input.task.kind, result, stages };
  } finally {
    if (db.inTransaction) db.exec("ROLLBACK");
    db.close();
  }
}

void run().then(
  result => parentPort?.postMessage(result),
  error =>
    parentPort?.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      cancelled: Atomics.load(cancel, 0) !== 0,
    } satisfies CandidateWorkerResult)
);
