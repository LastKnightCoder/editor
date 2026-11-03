import type { RuntimeSession } from "./types";

export const CONTENT_SAVE_LOG = "[content-save]";
const LOG_INTERVAL_MS = 30_000;
type DiagnosticState = {
  failure?: string;
  failureAt: number;
  suppressed: number;
  successAt: number;
  slowAt: number;
};
const states = new WeakMap<
  RuntimeSession,
  Partial<Record<"delta" | "projection", DiagnosticState>>
>();

function stateFor(session: RuntimeSession, scope: "delta" | "projection") {
  let bucket = states.get(session);
  if (!bucket) {
    bucket = {};
    states.set(session, bucket);
  }
  let state = bucket[scope];
  if (!state) {
    state = { failureAt: -Infinity, suppressed: 0, successAt: -Infinity, slowAt: -Infinity };
    bucket[scope] = state;
  }
  return state;
}

export function writeContentSaveLog(
  level: "info" | "warn",
  message: string,
  fields: Record<string, unknown>
) {
  try {
    console[level](CONTENT_SAVE_LOG, message, fields);
  } catch {
    /* 日志故障不能改变保存回执。 */
  }
}

const revisionTag = (value?: string) =>
  value && /^[a-f0-9]{64}$/i.test(value) ? value.slice(0, 12) : undefined;
const identifier = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : undefined;

export function contentSaveError(error: unknown) {
  try {
    const value = error as {
      name?: unknown;
      code?: unknown;
      cause?: { code?: unknown };
      message?: unknown;
      stack?: unknown;
    } | null;
    const message = typeof value?.message === "string" ? value.message : "";
    const reason = /修订|REVISION|VERSION_CONFLICT/.test(message)
      ? "revision-conflict"
      : /身份|关联已变化|绑定已变化|来源|BASELINE/.test(message)
        ? "identity"
        : /权限|冻结|FORBIDDEN|LOCKED/.test(message)
          ? "permission"
          : /容量|CAPACITY/.test(message)
            ? "capacity"
            : /契约|节点|格式|层级|JSON|预算|INVALID_DOCUMENT/.test(message)
              ? "invalid-content"
              : /图片|资源|附件/.test(message)
                ? "assets"
                : /持续变化/.test(message)
                  ? "concurrent-change"
                  : "unknown";
    const sites =
      typeof value?.stack === "string"
        ? value.stack
            .slice(0, 4000)
            .split("\n")
            .slice(1)
            .flatMap(line => {
              const name = line.trim().match(/^at (?:async )?([A-Za-z0-9_.$<>]+)/)?.[1];
              const position = line.match(/:(\d+):(\d+)\)?$/);
              return name
                ? [name.slice(0, 120) + (position ? `:${position[1]}:${position[2]}` : "")]
                : [];
            })
            .slice(0, 5)
        : undefined;
    return {
      errorName: identifier(value?.name),
      errorCode: identifier(value?.code),
      causeCode: identifier(value?.cause?.code),
      reason,
      sites,
    };
  } catch {
    return {
      errorName: undefined,
      errorCode: undefined,
      causeCode: undefined,
      reason: "unknown",
      sites: undefined,
    };
  }
}

function context(session: RuntimeSession) {
  return {
    sessionId: session.info.id,
    documentId: session.info.source?.contentDocumentId,
    contentId: session.info.source?.contentId,
    mode: session.info.mode,
    version: session.projectionVersion && { ...session.projectionVersion },
    confirmed: session.projectedVersion && { ...session.projectedVersion },
    pendingNodes: session.projectionNodes?.size,
    pending: session.projectionDirty,
    cacheWriteFailed: Boolean(session.cacheWriteFailed),
    sourceRevision: revisionTag(session.info.source?.projectionRevision),
  };
}

export function reportContentSaveIssue(
  session: RuntimeSession,
  stage: string,
  error?: unknown,
  details: {
    elapsedMs?: number;
    bytes?: number;
    attempts?: number;
    committed?: boolean;
    journalSaved?: boolean;
    expectedRevision?: string;
    actualRevision?: string;
  } = {}
) {
  const state = stateFor(session, stage.startsWith("delta.") ? "delta" : "projection"),
    now = performance.now(),
    failure = contentSaveError(error);
  const key = `${stage}:${failure.errorCode}:${failure.reason}`;
  if (state.failure === key && now - state.failureAt < LOG_INTERVAL_MS) {
    state.suppressed++;
    return;
  }
  const suppressed = state.suppressed;
  state.failure = key;
  state.failureAt = now;
  state.suppressed = 0;
  const fields = {
    ...context(session),
    stage,
    ...details,
    expectedRevision: revisionTag(details.expectedRevision),
    actualRevision: revisionTag(details.actualRevision),
    ...failure,
    suppressed,
  };
  if (error === undefined) writeContentSaveLog("info", "延后正文投影", fields);
  else
    writeContentSaveLog(
      "warn",
      stage.startsWith("delta.")
        ? "正文增量接纳失败，未确认本次输入"
        : "正文持久化失败，保留待保存状态",
      fields
    );
}

export function reportContentSaveComplete(
  session: RuntimeSession,
  details: {
    path: string;
    changed: boolean;
    selectedBlocks: number;
    writtenBlocks: number;
    elapsedMs: number;
    bytes?: number;
    attempts?: number;
    storageBefore?: number | null;
    storageAfter?: number | null;
  }
) {
  const state = stateFor(session, details.path === "delta" ? "delta" : "projection"),
    now = performance.now();
  const recovered = Boolean(state.failure);
  const layoutChanged = details.storageBefore !== details.storageAfter;
  const slow = details.elapsedMs >= 100 && now - state.slowAt >= LOG_INTERVAL_MS;
  const periodic = details.changed && now - state.successAt >= LOG_INTERVAL_MS;
  if (recovered || layoutChanged || details.path === "reconcile" || slow || periodic) {
    const message = recovered
      ? details.path === "delta"
        ? "正文增量接纳恢复"
        : "正文持久化恢复"
      : layoutChanged
        ? "正文存储布局切换完成"
        : details.path === "reconcile"
          ? "正文首次对账完成"
          : slow
            ? details.path === "delta"
              ? "正文增量接纳耗时较长"
              : "正文保存耗时较长"
            : "正文增量提交完成";
    const fields = { ...context(session), ...details, suppressedFailures: state.suppressed };
    writeContentSaveLog(slow ? "warn" : "info", message, fields);
    state.successAt = now;
    if (slow) state.slowAt = now;
  }
  state.failure = undefined;
  state.suppressed = 0;
}
