import {
  PERF_BATCH_SIZE,
  PERF_EVENT_CHANNEL,
  parsePerfContext,
  type PerfContext,
  type PerfInput,
  type PerfTrace,
} from "../../shared/perf-diagnostics";

let page: PerfContext = {};
let editorCount = 0;
let focusedEditor: { id: string; contentId?: number } | undefined;
let sequence = 0;
const prefix = Math.random().toString(36).slice(2, 10);
let queue: PerfInput[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let dropped = 0;
let current: PerfTrace | undefined;
let sendWindow = 0;
let sends = 0;

function context(): PerfContext {
  return {
    ...page,
    pageKey: page.pageKey,
    pageId: page.pageId,
    contentId: undefined,
    editorId: undefined,
    role: window.electron?.windowRole,
    editorCount,
    ...(focusedEditor ? { editorId: focusedEditor.id, contentId: focusedEditor.contentId } : {}),
    visible: !document.hidden,
    focused: document.hasFocus(),
  };
}

export function flushPerfEvents(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!queue.length && !dropped) return;
  const now = Date.now();
  if (now - sendWindow >= 1000) {
    sendWindow = now;
    sends = 0;
  }
  if (sends >= 8) {
    timer = setTimeout(flushPerfEvents, Math.max(1, 1000 - (now - sendWindow)));
    return;
  }
  const bridge = window.electron;
  if (!bridge) {
    queue = [];
    dropped = 0;
    return;
  }
  const events = queue;
  queue = [];
  sends++;
  try {
    bridge.send(PERF_EVENT_CHANNEL, { events, dropped });
    dropped = 0;
  } catch {
    dropped += events.length;
  }
}

export function reportPerfEvent(input: Omit<PerfInput, "t"> & { t?: number }, urgent = false) {
  if (!window.electron) return;
  if (queue.length >= PERF_BATCH_SIZE) {
    dropped++;
    return;
  }
  queue.push({ ...input, t: input.t ?? Date.now(), context: { ...context(), ...input.context } });
  if (urgent) flushPerfEvents();
  else timer ??= setTimeout(flushPerfEvents, 1000);
}

export function setPerfPageContext(next: PerfContext) {
  page = parsePerfContext(next);
  reportPerfEvent({ kind: "context" }, true);
}

export function registerPerfEditor(contentId?: number) {
  const id = `${prefix}-editor-${++sequence}`;
  editorCount++;
  let disposed = false;
  reportPerfEvent({ kind: "context" });
  return {
    id,
    focus(active: boolean) {
      if (disposed) return;
      if (active) focusedEditor = { id, contentId };
      else if (focusedEditor?.id === id) focusedEditor = undefined;
      reportPerfEvent({ kind: "context" });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      editorCount--;
      if (focusedEditor?.id === id) focusedEditor = undefined;
      reportPerfEvent({ kind: "context" });
    },
  };
}

export const currentPerfTrace = () => current;

/** 仅在调用入口设置作用域；跨 await 的调用方显式捕获 trace，避免并发串线。 */
export function runWithPerfTrace<T>(trace: PerfTrace | undefined, run: () => T): T {
  const previous = current;
  current = trace;
  try {
    return run();
  } finally {
    current = previous;
  }
}

export function beginPerfOperation(
  label: string,
  extra: PerfContext = {},
  values?: Record<string, number>
) {
  const trace: PerfTrace = {
    operationId: `${prefix}-${++sequence}`,
    context: { ...context(), ...current?.context, ...parsePerfContext(extra) },
  };
  if (Object.hasOwn(extra, "contentId") && extra.contentId === undefined)
    trace.context.contentId = undefined;
  const parentId = current?.operationId;
  const started = performance.now();
  let ended = false;
  const emit = (input: Omit<PerfInput, "t">, urgent = false) =>
    reportPerfEvent(
      {
        ...input,
        operationId: trace.operationId,
        parentId,
        context: trace.context,
      },
      urgent
    );
  emit({ kind: "operation-start", label, values }, true);
  return {
    trace,
    end(status: PerfInput["status"] = "ok") {
      if (ended) return;
      ended = true;
      emit({ kind: "operation-end", label, ms: performance.now() - started, status });
    },
    stage<T>(phase: string, run: () => T): T {
      const at = performance.now();
      emit({ kind: "stage-start", label: phase }, true);
      const finish = (status: PerfInput["status"]) =>
        emit({ kind: "stage", label: phase, ms: performance.now() - at, status });
      try {
        const result = runWithPerfTrace(trace, run);
        if (result instanceof Promise)
          return result.then(
            value => {
              finish("ok");
              return value;
            },
            error => {
              finish("error");
              throw error;
            }
          ) as T;
        finish("ok");
        return result;
      } catch (error) {
        finish("error");
        throw error;
      }
    },
  };
}

export function measurePerf<T>(label: string, run: () => T, extra?: PerfContext): T {
  const operation = beginPerfOperation(label, extra);
  try {
    const result = runWithPerfTrace(operation.trace, run);
    if (result instanceof Promise)
      return result.then(
        value => {
          operation.end();
          return value;
        },
        error => {
          operation.end("error");
          throw error;
        }
      ) as T;
    operation.end();
    return result;
  } catch (error) {
    operation.end("error");
    throw error;
  }
}
