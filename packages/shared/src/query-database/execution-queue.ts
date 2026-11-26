import type { RunningQuery } from "./session";
import type { QueryResult } from "./types";

interface Entry {
  finished: boolean;
  active: boolean;
  running?: RunningQuery;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
  run(remainingMs: number): RunningQuery;
  resolve(result: QueryResult): void;
  reject(error: Error): void;
}

export function createQueryExecutionQueue(concurrency: number, backlog: number) {
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    !Number.isSafeInteger(backlog) ||
    backlog < 0
  )
    throw new Error("查询并发配置无效");
  const waiting: Entry[] = [];
  let active = 0;
  const finish = (entry: Entry, error?: Error, result?: QueryResult) => {
    if (entry.finished) return;
    entry.finished = true;
    clearTimeout(entry.timer);
    if (entry.active) active--;
    else {
      const index = waiting.indexOf(entry);
      if (index !== -1) waiting.splice(index, 1);
    }
    if (error) entry.reject(error);
    else if (result) entry.resolve(result);
    else entry.reject(new Error("查询没有返回结果"));
    dispatch();
  };
  const dispatch = () => {
    while (active < concurrency && waiting.length) {
      const entry = waiting.shift();
      if (!entry || entry.finished) continue;
      const remaining = entry.deadline - Date.now();
      if (remaining <= 0) {
        finish(entry, new Error("查询等待超时，请减少同时运行的查询"));
        continue;
      }
      active++;
      entry.active = true;
      try {
        const running = entry.run(remaining);
        entry.running = running;
        void running.result.then(
          result => finish(entry, undefined, result),
          error => finish(entry, error instanceof Error ? error : new Error(String(error)))
        );
      } catch (error) {
        finish(entry, error instanceof Error ? error : new Error(String(error)));
      }
    }
  };
  return {
    start(run: Entry["run"], timeoutMs: number): RunningQuery {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("查询运行期限无效");
      let entry: Entry;
      const result = new Promise<QueryResult>((resolve, reject) => {
        entry = {
          finished: false,
          active: false,
          deadline: Date.now() + timeoutMs,
          run,
          resolve,
          reject,
          timer: setTimeout(() => {
            const error = new Error(
              entry.active
                ? "查询执行超时，请缩小范围或简化脚本"
                : "查询等待超时，请减少同时运行的查询"
            );
            try {
              entry.running?.cancel(error);
            } catch {
              /* 取消失败仍须归还执行槽。 */
            }
            finish(entry, error);
          }, timeoutMs),
        };
        if (active >= concurrency && waiting.length >= backlog) {
          finish(entry, new Error("等待执行的查询过多，请减少同时运行的查询"));
          return;
        }
        waiting.push(entry);
        dispatch();
      });
      return {
        result,
        cancel() {
          if (entry.finished) return;
          try {
            entry.running?.cancel();
          } catch {
            /* 后续结果已作废，取消错误不传播到界面。 */
          }
          finish(entry, new DOMException("查询已取消", "AbortError"));
        },
      };
    },
  };
}
