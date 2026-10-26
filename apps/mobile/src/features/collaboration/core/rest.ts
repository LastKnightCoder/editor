// 协作服务器 REST 客户端：经 Rust 网关（collab_request）转发并自动附带设备身份。
// 契约对齐 apps/collaboration-server/src/content-routes.ts。
import { invoke } from "@tauri-apps/api/core";
import type {
  DeviceIdentity,
  JoinRequest,
  JoinRequestResult,
  SharedDocumentInfo,
  DocumentProtocol,
} from "@tau/collaboration";

type RequestInput = {
  serverUrl: string;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export function request<T>(input: RequestInput) {
  return invoke<T>("collab_request", {
    payload: {
      serverUrl: input.serverUrl,
      path: input.path,
      method: input.method ?? "GET",
      body: input.body ?? null,
    },
  });
}

export function getIdentity(serverUrl: string, nickname?: string) {
  return invoke<DeviceIdentity>("collab_get_identity", {
    payload: { serverUrl, nickname: nickname ?? null },
  });
}

export function updateNickname(serverUrl: string, nickname: string) {
  return invoke<DeviceIdentity>("collab_update_nickname", {
    payload: { serverUrl, nickname },
  });
}

export function listDocuments(serverUrl: string) {
  return request<{ documents: SharedDocumentInfo[] }>({ serverUrl, path: "/v1/documents" });
}

export function getDocumentState(serverUrl: string, documentId: string) {
  return request<{ state: string }>({
    serverUrl,
    path: `/v1/documents/${documentId}/state`,
  });
}

export function getDocumentProtocol(serverUrl: string, documentId: string) {
  return request<DocumentProtocol>({ serverUrl, path: `/v1/documents/${documentId}/protocol` });
}

export function fetchTicket(
  serverUrl: string,
  documentId: string | null,
  protocol?: { protocolVersion: number; epoch: number; baselineId: string }
) {
  return request<{ ticket: string; expiresIn: number }>({
    serverUrl,
    path: "/v1/tickets",
    method: "POST",
    body: { documentId, ...protocol },
  });
}

export function createDocument(serverUrl: string, idempotencyKey: string) {
  return request<{ id: string; status: string }>({
    serverUrl,
    path: "/v1/documents",
    method: "POST",
    body: { idempotencyKey },
  });
}

export function publishDocument(serverUrl: string, documentId: string, state: string) {
  return request<unknown>({
    serverUrl,
    path: `/v1/documents/${documentId}/publish`,
    method: "POST",
    body: { state },
  });
}

export function rotateInvitation(serverUrl: string, documentId: string) {
  return request<{ code: string; expiresAt: number }>({
    serverUrl,
    path: `/v1/documents/${documentId}/invitation`,
    method: "POST",
  });
}

export function requestJoin(serverUrl: string, code: string) {
  return request<JoinRequestResult>({
    serverUrl,
    path: "/v1/join-requests",
    method: "POST",
    body: { code },
  });
}

export function listJoinRequests(serverUrl: string) {
  return request<{ requests: JoinRequest[] }>({ serverUrl, path: "/v1/join-requests" });
}

export function decideJoinRequest(serverUrl: string, requestId: string, approve: boolean) {
  return request<{ ok: boolean }>({
    serverUrl,
    path: `/v1/join-requests/${requestId}/decision`,
    method: "POST",
    body: { approve },
  });
}

export function leaveDocument(serverUrl: string, documentId: string) {
  return request<{ ok: boolean }>({
    serverUrl,
    path: `/v1/documents/${documentId}/leave`,
    method: "POST",
  });
}

export function closeDocument(serverUrl: string, documentId: string, expectedRevision: string) {
  return request<{ ok: boolean }>({
    serverUrl,
    path: `/v1/documents/${documentId}/close`,
    method: "POST",
    body: { expectedRevision },
  });
}

export function removeMember(serverUrl: string, documentId: string, deviceId: string) {
  return request<{ ok: boolean }>({
    serverUrl,
    path: `/v1/documents/${documentId}/members/${deviceId}`,
    method: "DELETE",
  });
}
