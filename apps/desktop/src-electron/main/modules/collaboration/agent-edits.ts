import {
  NODE_DOCUMENT_VERSION,
  buildScopedContentUpdate,
  ScopedContentConflictError,
  ScopedUndoLimitError,
  type DocumentOperation,
  type ScopedContentSubmission,
  type ScopedContentResult,
} from "@tau/collaboration";
import type { ScopedWriteOptions } from "../content-runtime/agent/suggestion-service";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./index";

export async function readSharedAgentState(manager: CollaborationManager, session: RuntimeSession) {
  const remote = await manager.client.request<{ state: string }>(
    session.info.serverUrl,
    `/v1/documents/${session.info.id}/state`,
    "GET",
    undefined,
    NODE_DOCUMENT_VERSION
  );
  return Buffer.from(remote.state, "base64");
}

export async function submitSharedAgentEdit(
  manager: CollaborationManager,
  session: RuntimeSession,
  request: ScopedContentSubmission,
  updateHash: string,
  check: () => void,
  { signal, undo }: ScopedWriteOptions
): Promise<ScopedContentResult> {
  const route = `/v1/documents/${session.info.id}/operations/${request.operationId}`;
  const url = session.info.serverUrl;
  const key = `scoped-edit-request:${url}:${session.info.id}:${request.operationId}`;
  const known = manager.store.get<{ updateHash: string; expiresAt: number } | null>(key, null);
  if (known && known.updateHash !== updateHash) throw new Error("操作身份已被另一请求使用");
  if (!known) {
    await manager.client.request(url, `/v1/documents/${session.info.id}/protocol`);
    check();
    if (session.info.pending || session.provider?.hasUnsyncedChanges) {
      try {
        await buildScopedContentUpdate(session.doc, request.scope, { undo });
      } catch (error) {
        if (error instanceof ScopedContentConflictError)
          return { status: "conflict", conflicts: error.conflicts };
        if (error instanceof ScopedUndoLimitError)
          return { status: "rejected", reason: error.code };
        throw error;
      }
    }
    check();
  }
  const expiresAt = known?.expiresAt ?? manager.client.serverTime(url) + 4 * 60_000;
  if (!known) manager.store.set(key, { updateHash, expiresAt });
  let operation: DocumentOperation | null;
  const envelope = {
    kind: "scoped-edit",
    version: NODE_DOCUMENT_VERSION,
    baselineId: request.baselineId,
    epoch: request.epoch,
    expiresAt,
    updateHash,
  };
  const cancel = () => {
    // 已进入提交事务的请求仍以原操作回执为准。
    void manager.client.request(url, `${route}/cancel`, "POST", envelope).catch(() => undefined);
  };
  check();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    ({ operation } = await manager.client.request<{ operation: DocumentOperation | null }>(
      url,
      route,
      "POST",
      {
        ...envelope,
        scope: request.scope,
      }
    ));
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    try {
      ({ operation } = await manager.client.request<{ operation: DocumentOperation | null }>(
        url,
        route
      ));
    } catch {
      if (failure.status === 401 || failure.status === 403)
        return { status: "rejected", reason: failure.code ?? "FORBIDDEN" };
      return { status: "pending" };
    }
    if (!operation && failure.status && failure.status < 500 && failure.status !== 429)
      return { status: "rejected", reason: failure.code ?? "INVALID_OPERATION" };
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  if (operation?.state === "COMMITTED")
    return { status: "committed", inverse: operation.receipt?.inverse };
  if (operation?.conflicts) return { status: "conflict", conflicts: operation.conflicts };
  if (operation?.state === "ABORTED" || operation?.state === "EXPIRED")
    return { status: "rejected", reason: operation.reason ?? operation.state };
  return { status: "pending" };
}
