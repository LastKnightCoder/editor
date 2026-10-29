import { invoke } from "@tauri-apps/api/core";

export interface NativeLibraryLease {
  leaseId: string;
  databaseName: string;
  generation: number;
}
export interface NativeSessionRow {
  id: string;
  scope: string;
  domainRef: string | null;
  sessionFile: string;
  cwd: string;
  title: string;
  titleDirty: boolean;
  groupId: number | null;
  orderNum: number | null;
  archived: boolean;
  source: "desktop" | "mobile" | "browser";
  messageCount: number;
  createTime: number;
  updateTime: number;
}
export interface NativeSession {
  row: NativeSessionRow;
  revision: string;
  size: number;
}
export interface NativeSessionChunk {
  row: NativeSessionRow;
  revision: string;
  data: string;
  nextOffset: number;
  eof: boolean;
}
export interface NativeSessionCommit {
  sessionId: string;
  operationId: string;
  expectedRevision: string;
  entries: Record<string, unknown>[];
}
export interface NativeSessionCreate {
  id: string;
  scope: string;
  domainRef?: string | null;
  title?: string;
  cwd?: string;
  header: Record<string, unknown>;
}
const leaseArgs = (lease: NativeLibraryLease) => ({ leaseId: lease.leaseId });
const encode = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};
const decode = (value: string) =>
  Uint8Array.from(atob(value), character => character.charCodeAt(0));
export const acquireLibrary = (databaseName: string) =>
  invoke<NativeLibraryLease>("ai_library_acquire", { databaseName });
export const assertLibrary = (lease: NativeLibraryLease) =>
  invoke<NativeLibraryLease>("ai_library_assert", leaseArgs(lease));
export const releaseLibrary = (lease: NativeLibraryLease) =>
  invoke<void>("ai_library_release", leaseArgs(lease));
export const setRunActive = (
  lease: NativeLibraryLease,
  runId: string,
  active: boolean,
  sessionId?: string
) => invoke<void>("ai_run_active", { ...leaseArgs(lease), runId, active, sessionId });
export const createSession = (lease: NativeLibraryLease, input: NativeSessionCreate) =>
  invoke<NativeSession>("ai_session_create", { ...leaseArgs(lease), input });
export const readSession = (lease: NativeLibraryLease, sessionId: string, offset = 0) =>
  invoke<NativeSessionChunk>("ai_session_read", { ...leaseArgs(lease), sessionId, offset });
export const patchSession = (
  lease: NativeLibraryLease,
  sessionId: string,
  expectedRevision: string,
  patch: Partial<
    Pick<NativeSessionRow, "title" | "titleDirty" | "groupId" | "orderNum" | "archived">
  >
) =>
  invoke<NativeSession>("ai_session_patch", {
    ...leaseArgs(lease),
    sessionId,
    expectedRevision,
    patch,
  });
export const removeSession = (
  lease: NativeLibraryLease,
  sessionId: string,
  expectedRevision: string
) => invoke<void>("ai_session_remove", { ...leaseArgs(lease), sessionId, expectedRevision });
export const listSessions = (
  lease: NativeLibraryLease,
  filter: {
    scope?: string;
    domainRef?: string | null;
    includeArchived?: boolean;
    offset?: number;
    limit?: number;
  } = {}
) =>
  invoke<{ items: NativeSessionRow[]; nextOffset: number; hasMore: boolean }>("ai_session_list", {
    ...leaseArgs(lease),
    ...filter,
    filterDomain: filter.domainRef !== undefined,
    includeArchived: filter.includeArchived ?? false,
    offset: filter.offset ?? 0,
    limit: filter.limit ?? 30,
  });
export async function commitSession(
  lease: NativeLibraryLease,
  input: NativeSessionCommit
): Promise<NativeSession> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  if (bytes.length <= 64 * 1024) return invoke("ai_session_commit", { ...leaseArgs(lease), input });
  const id = await invoke<string>("ai_session_stage_open", leaseArgs(lease));
  let finished = false;
  try {
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024)
      await invoke("ai_session_stage_write", {
        ...leaseArgs(lease),
        id,
        offset,
        data: encode(bytes.slice(offset, offset + 64 * 1024)),
      });
    const result = await invoke<NativeSession>("ai_session_stage_finish", {
      ...leaseArgs(lease),
      id,
      discard: false,
    });
    finished = true;
    return result;
  } finally {
    if (!finished)
      await invoke("ai_session_stage_finish", { ...leaseArgs(lease), id, discard: true }).catch(
        () => undefined
      );
  }
}
export const getModelConfig = () =>
  invoke<{
    llmProviders: Record<string, unknown>[];
    llmUsageSettings: Record<string, unknown> | null;
  }>("ai_model_config");

/** 一个上下文冻结整轮模型配置；凭据由原生注入，不进入 WebView。 */
export async function createModelFetch(
  lease: NativeLibraryLease,
  providerId: string,
  modelId?: string
) {
  const { contextId, config } = await invoke<{
    contextId: string;
    config: Awaited<ReturnType<typeof getModelConfig>>;
  }>("ai_http_context", {
    ...leaseArgs(lease),
    providerId,
    modelId,
  });
  return { ...createContextFetch(contextId), config };
}
export async function createMcpFetch(
  lease: NativeLibraryLease,
  config: {
    id: string;
    transport: { type: "streamable-http"; url: string; headers?: Record<string, string> };
  }
) {
  const contextId = await invoke<string>("ai_mcp_context", {
    ...leaseArgs(lease),
    url: config.transport.url,
    headers: config.transport.headers ?? {},
  });
  return createContextFetch(contextId);
}
function createContextFetch(contextId: string) {
  let disposed = false;
  const active = new Set<string>();
  const fetch: typeof globalThis.fetch = async (input, init) => {
    if (disposed) throw new Error("AI_TRANSPORT_FAILED:网络上下文已释放");
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const id = await invoke<string>("ai_http_open", {
      contextId,
      request: {
        url: request.url,
        method: request.method,
        headers: [...request.headers],
        hasBody: request.body !== null,
      },
    });
    active.add(id);
    const cancel = () => {
      active.delete(id);
      return invoke<void>("ai_http_cancel", { id });
    };
    const abort = () => {
      void cancel().catch(() => undefined);
    };
    request.signal.addEventListener("abort", abort, { once: true });
    try {
      request.signal.throwIfAborted();
      if (request.body) {
        const reader = request.body.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (let offset = 0; offset < value.length; offset += 64 * 1024) {
              request.signal.throwIfAborted();
              await invoke("ai_http_upload", {
                id,
                chunk: encode(value.slice(offset, offset + 64 * 1024)),
              });
            }
          }
        } finally {
          reader.releaseLock();
        }
        await invoke("ai_http_upload", { id, chunk: null });
      }
      const metadata = await invoke<{
        status: number;
        statusText: string;
        headers: [string, string][];
        hasBody: boolean;
      }>("ai_http_response", { id });
      const cleanup = () => request.signal.removeEventListener("abort", abort);
      const body = metadata.hasBody
        ? new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                request.signal.throwIfAborted();
                const bytes = await invoke<string | null>("ai_http_read", { id });
                if (bytes === null) {
                  cleanup();
                  active.delete(id);
                  controller.close();
                } else controller.enqueue(decode(bytes));
              } catch (error) {
                cleanup();
                await cancel().catch(() => undefined);
                controller.error(error);
              }
            },
            async cancel() {
              cleanup();
              await cancel();
            },
          })
        : null;
      if (!body) {
        cleanup();
        await cancel();
      }
      return new Response(body, {
        status: metadata.status,
        statusText: metadata.statusText,
        headers: metadata.headers,
      });
    } catch (error) {
      request.signal.removeEventListener("abort", abort);
      await cancel().catch(() => undefined);
      throw error;
    }
  };
  return {
    fetch,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await invoke<void>("ai_http_dispose", { contextId });
      active.clear();
    },
  };
}
