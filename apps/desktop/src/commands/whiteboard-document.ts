import { invoke, on, off } from "@/electron";
import { withModule } from "./module-init";
import type { WhiteboardDocumentBackend } from "@/services/whiteboard-documents/client";
import type { WhiteboardRemoteBackend } from "@/services/whiteboard-documents/remote";
import type {
  WhiteboardDocumentEvent,
  WhiteboardDocumentFlushRequest,
  WhiteboardDocumentResume,
  WhiteboardRemoteStatus,
  WhiteboardShareCandidate,
  WhiteboardShareStatus,
} from "@/types/whiteboard-document";
const call = <T>(method: string, ...args: unknown[]) =>
  withModule("whiteboard-documents", () => invoke<T>(`whiteboard-document:${method}`, ...args));
const subscribe = <T>(channel: string, listener: (value: T) => void) => {
  const handler = (_event: unknown, value: T) => listener(value);
  on(channel, handler);
  return () => off(channel, handler);
};
export const whiteboardDocumentBackend: WhiteboardDocumentBackend = {
  open: (target, viewId) => call("open", target.databaseName, target.contentId, viewId),
  append: (lease, batch, update) => call("append", lease, batch, update),
  snapshot: lease => call("snapshot", lease),
  flush: lease => call("flush", lease),
  release: lease => call("release", lease),
  events: listener => subscribe<WhiteboardDocumentEvent>("whiteboard-document:update", listener),
  drains: listener =>
    subscribe<WhiteboardDocumentFlushRequest>("whiteboard-document:drain", listener),
  resumes: listener => subscribe<WhiteboardDocumentResume>("whiteboard-document:resume", listener),
  detached: listener =>
    subscribe<{ leaseId: string }>("whiteboard-document:detached", event =>
      listener(event.leaseId)
    ),
  drained: (requestId, error) => call("drained", requestId, error),
};
export const readWhiteboardShareStatus = (databaseName: string, documentId: string) =>
  call<WhiteboardShareStatus>("share-status", databaseName, documentId);
export const whiteboardRemoteBackend: WhiteboardRemoteBackend = {
  open: (leaseId, serverUrl) => call<WhiteboardRemoteStatus>("remote-open", leaseId, serverUrl),
  sync: leaseId => call<WhiteboardRemoteStatus>("remote-sync", leaseId),
};
/** 把已加入的共享白板落到当前资料库；已落库时返回原文档。 */
export const installSharedWhiteboard = (databaseName: string, serverUrl: string, roomId: string) =>
  call<{ documentId: string; boardId: number | null; contentIds: number[] }>(
    "remote-install",
    databaseName,
    serverUrl,
    roomId
  );
/** 尚未共享的整块白板，按标题检索（空关键词按最近更新），至多 30 条。 */
export const searchWhiteboardShareCandidates = (databaseName: string, keyword: string) =>
  call<WhiteboardShareCandidate[]>("share-candidates", databaseName, keyword);
export const locateWhiteboardDocument = (databaseName: string, contentId: number) =>
  call<{ documentId: string; pageId: string } | null>("locate", databaseName, contentId);
export const createWhiteboardDocument = (
  databaseName: string,
  requestId: string,
  state: Uint8Array,
  owner: "board" | "standalone"
) =>
  call<{ documentId: string; boardId: number | null; contentIds: number[] }>(
    "create",
    databaseName,
    requestId,
    state,
    owner
  );

export const resolveWhiteboardDocumentPage = (
  databaseName: string,
  documentId: string,
  pageId: string
) => call<number>("resolve-page", databaseName, documentId, pageId);

export const referenceWhiteboardEntity = (
  databaseName: string,
  kind: import("@tau/db-schema/content-identities").ContentEntityKind,
  id: number
) =>
  call<import("@tau/db-schema/content-identities").ContentEntityReference>(
    "reference-entity",
    databaseName,
    kind,
    id
  );
export const resolveWhiteboardEntity = (
  databaseName: string,
  reference: import("@tau/db-schema/content-identities").ContentEntityReference
) => call<number | null>("resolve-entity", databaseName, reference);

export const uploadWhiteboardDocumentResource = (
  leaseId: string,
  payload: { name: string; mime: string; bytes: Uint8Array }
) => call<string>("resource-upload", leaseId, payload);
export const resolveWhiteboardDocumentResource = (leaseId: string, reference: string) =>
  call<string>("resource-resolve", leaseId, reference);

export const importWhiteboardDocumentResource = (
  leaseId: string,
  sourceDocumentId: string,
  reference: string
) => call<string>("resource-import", leaseId, sourceDocumentId, reference);
export const readWhiteboardDocumentResource = (leaseId: string, reference: string) =>
  call<{ name: string; mime: string; bytes: Uint8Array }>("resource-read", leaseId, reference);

export const copyWhiteboardDocumentContent = (leaseId: string, elementId: string) =>
  call<number>("copy-content", leaseId, elementId);
export const publishWhiteboard = (
  leaseId: string,
  request: { operationId: string; serverUrl: string; pageIds: string[] }
) => call<{ documentId: string; serverUrl: string }>("publish", leaseId, request);
export const resumeWhiteboardPublication = (databaseName: string, operationId: string) =>
  call<{ documentId: string; serverUrl: string }>("publish-resume", databaseName, operationId);
export const cancelWhiteboardPublication = (databaseName: string, operationId: string) =>
  call<void>("publish-cancel", databaseName, operationId);
export const resumeWhiteboardUnshare = (databaseName: string, documentId: string) =>
  call<void>("unshare-resume", databaseName, documentId);
/** 结束共享（作者）、退出（成员）或在共享已结束/失去权限后转为本机白板。 */
export const unshareWhiteboard = (
  leaseId: string,
  request: { operationId: string; mode: "close" | "leave" | "detach" }
) => call<{ missing: number }>("unshare", leaseId, request);
