/**
 * 知识地图计算 worker：纯计算，不碰数据库（better-sqlite3 连接不能跨线程）。
 * 主线程读好输入转移进来，这里跑完把结果送回去，由主线程写库。
 */

import { parentPort } from "node:worker_threads";
import { computeKnowledgeMap } from "@/knowledge-map/compute";
import { meanPool } from "@/knowledge-map/vectors";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type { KnowledgeMapInputs } from "../modules/tables/knowledge-map";

export type KnowledgeMapWorkerResult =
  { ok: true; map: KnowledgeMap } | { ok: false; message: string };

parentPort!.once("message", (inputs: KnowledgeMapInputs) => {
  try {
    const vectors = meanPool(
      new Map(
        inputs.chunks.map(([id, buffers]) => [id, buffers.map(buffer => new Float32Array(buffer))])
      )
    );
    const map = computeKnowledgeMap(inputs.cards, vectors);
    parentPort!.postMessage({ ok: true, map } satisfies KnowledgeMapWorkerResult);
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    } satisfies KnowledgeMapWorkerResult);
  }
});
