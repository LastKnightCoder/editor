import workerUrl from "./worker.ts?worker&url";
import { isQuerySource } from "./catalog";
import { validateQueryResult } from "./result";
import { createQueryExecutionQueue } from "./execution-queue";
import {
  QUERY_LIMITS,
  readQueryDefinition,
  querySerializedBytes,
  type QueryContext,
  type QueryDefinition,
  type QueryReader,
  type QueryResult,
  type QuerySource,
} from "./types";

export interface QueryExecution {
  result: Promise<QueryResult>;
  cancel(reason?: Error): void;
}

// Worker 继承创建文档的 CSP；独立的无同源 iframe 为脚本禁止网络和外部模块。
const workerDocument = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"></head><body><script>
addEventListener('message', event => {
  if (event.source !== parent || !event.ports[0]) return;
  const port = event.ports[0];
  const url = URL.createObjectURL(new Blob([event.data.source], {type:'text/javascript'}));
  const worker = new Worker(url);
  worker.onmessage = event => { if(event.data?.type !== 'stopped') port.postMessage(event.data); };
  worker.onerror = event => port.postMessage({type:'error',error:event.message || '查询执行失败'});
  port.onmessage = event => {
    if(event.data.type === 'stop') { worker.terminate(); URL.revokeObjectURL(url); port.postMessage({type:'stopped'}); port.close(); }
    else worker.postMessage(event.data);
  };
  port.start();
  worker.postMessage(event.data.run);
});
</script></body></html>`;

interface QuerySandbox {
  frame: HTMLIFrameElement;
  loaded: Promise<void>;
  users: number;
  retired: boolean;
  failures: Set<(error: Error) => void>;
}
let sandbox: QuerySandbox | undefined;
let retained = 0;
let disposeTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSandboxDisposal() {
  if (!sandbox || sandbox.users || retained) return;
  clearTimeout(disposeTimer);
  disposeTimer = setTimeout(() => {
    if (!sandbox || sandbox.users || retained) return;
    sandbox.frame.remove();
    sandbox = undefined;
  }, 0);
}

/** 查询面板存续期间复用隔离文档，每次执行仍使用独立 Worker。 */
export function retainQueryRuntime(): () => void {
  retained++;
  clearTimeout(disposeTimer);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    retained--;
    scheduleSandboxDisposal();
  };
}

function acquireSandbox() {
  clearTimeout(disposeTimer);
  if (!sandbox) {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.srcdoc = workerDocument;
    const loaded = new Promise<void>(resolve =>
      frame.addEventListener("load", () => resolve(), { once: true })
    );
    sandbox = { frame, loaded, users: 0, retired: false, failures: new Set() };
    document.body.append(frame);
  }
  const host = sandbox;
  host.users++;
  return {
    frame: host.frame,
    loaded: host.loaded,
    isRetired: () => host.retired,
    subscribeFailure(callback: (error: Error) => void) {
      host.failures.add(callback);
      return () => host.failures.delete(callback);
    },
    retire(error: Error) {
      if (host.retired) return;
      host.retired = true;
      if (sandbox === host) sandbox = undefined;
      host.frame.remove();
      for (const failure of [...host.failures]) failure(error);
    },
    release() {
      host.users--;
      scheduleSandboxDisposal();
    },
  };
}

interface QueryExecutionInput {
  definition: QueryDefinition;
  context: QueryContext;
  read: QueryReader;
  onDependency?(source: QuerySource): void;
  onClock?(): void;
  timeoutMs?: number;
}
const executionQueue = createQueryExecutionQueue(QUERY_LIMITS.concurrency, QUERY_LIMITS.backlog);
export function startQuery(input: QueryExecutionInput): QueryExecution {
  const definition = readQueryDefinition(input.definition);
  const context = structuredClone(input.context);
  return executionQueue.start(
    remainingMs => executeQueryNow({ ...input, definition, context, timeoutMs: remainingMs }),
    input.timeoutMs ?? QUERY_LIMITS.timeoutMs
  );
}

function executeQueryNow(input: QueryExecutionInput): QueryExecution {
  const definition = readQueryDefinition(input.definition);
  const controller = new AbortController();
  const host = acquireSandbox();
  const frame = host.frame;
  const channel = new MessageChannel();
  let finished = false;
  let reads = 0;
  let outstanding = 0;
  let launched = false;
  let stopped: (() => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;
  const cleanup = (done: () => void) => {
    controller.abort();
    clearTimeout(timer);
    let released = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(fallback);
      unsubscribeFailure();
      channel.port1.close();
      channel.port2.close();
      host.release();
      done();
    };
    if (!launched || host.isRetired()) release();
    else {
      // 先确认 Worker 已终止，再释放宿主，避免分离文档继续持有执行进程。
      stopped = release;
      fallback = setTimeout(() => {
        host.retire(new Error("查询执行环境已中断，请重试"));
        release();
      }, 1000);
      channel.port1.postMessage({ type: "stop" });
    }
  };
  const fail = (error: Error) => {
    if (finished) return;
    finished = true;
    cleanup(() => rejectResult?.(error));
  };
  const unsubscribeFailure = host.subscribeFailure(fail);
  const timer = setTimeout(
    () => host.retire(new Error("查询执行超时，请缩小数据范围或简化脚本")),
    input.timeoutMs ?? QUERY_LIMITS.timeoutMs
  );
  const result = new Promise<QueryResult>((resolve, reject) => {
    rejectResult = reject;
    channel.port1.onmessage = event => {
      if (event.data?.type === "stopped") {
        stopped?.();
        return;
      }
      if (finished) return;
      const message = event.data;
      if (message?.type === "clock") {
        input.onClock?.();
        return;
      }
      if (message?.type === "result") {
        try {
          const value = validateQueryResult(message.result);
          finished = true;
          cleanup(() => resolve(value));
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      } else if (message?.type === "error") fail(new Error(String(message.error)));
      else if (message?.type === "read") {
        if (
          !message.request ||
          !isQuerySource(message.request.source) ||
          ++reads > 1000 ||
          outstanding >= 16
        ) {
          fail(new Error("数据读取请求无效或过多"));
          return;
        }
        input.onDependency?.(message.request.source);
        outstanding++;
        void Promise.resolve()
          .then(() => input.read(message.request))
          .then(
            page => {
              if (!finished) {
                if (querySerializedBytes(page) > QUERY_LIMITS.bytes)
                  throw new Error("读取的数据过大，请缩小范围");
                channel.port1.postMessage({ type: "read-result", id: message.id, page });
              }
            },
            error => {
              if (!finished)
                channel.port1.postMessage({
                  type: "read-result",
                  id: message.id,
                  error: error instanceof Error ? error.message : String(error),
                });
            }
          )
          .catch(error =>
            fail(
              new Error(
                error instanceof Error && error.name !== "DataCloneError"
                  ? error.message
                  : "数据源返回了无法传递的内容，请检查返回值"
              )
            )
          )
          .finally(() => outstanding--);
      }
    };
    channel.port1.start();
    void Promise.all([
      host.loaded,
      fetch(workerUrl, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error("无法加载查询执行器");
        return response.text();
      }),
    ])
      .then(([, source]) => {
        if (!finished) {
          launched = true;
          frame.contentWindow?.postMessage(
            { source, run: { type: "run", definition, context: input.context } },
            "*",
            [channel.port2]
          );
        }
      })
      .catch(error => fail(error instanceof Error ? error : new Error(String(error))));
  });
  return {
    result,
    cancel: reason => {
      if (reason) host.retire(reason);
      else fail(new DOMException("查询已取消", "AbortError"));
    },
  };
}
