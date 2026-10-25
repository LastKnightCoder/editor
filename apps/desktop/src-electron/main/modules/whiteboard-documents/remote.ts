import { createHash } from "node:crypto";
import {
  DocumentSyncSession,
  type DocumentSyncJournal,
  type DocumentSyncState,
  type DocumentSyncTransport,
  type DocumentOperation,
  type ConfirmedDocument,
} from "@tau/collaboration";
import type { WhiteboardJournal } from "./journal";
import type { CollaborationClient } from "../collaboration/client";

/** 本机网络分支独立于可替换主库；保留被拒更新、确认基线与已知回执。 */
export class WhiteboardRemoteJournal implements DocumentSyncJournal {
  private hash: string | null = null;
  constructor(
    private readonly journal: WhiteboardJournal,
    private readonly key: string
  ) {
    journal.db.exec(
      "CREATE TABLE IF NOT EXISTS remote_branches (scope TEXT PRIMARY KEY, value TEXT NOT NULL, hash TEXT NOT NULL)"
    );
  }
  async load(): Promise<DocumentSyncState | null> {
    const row = this.journal.db
      .prepare("SELECT value,hash FROM remote_branches WHERE scope=?")
      .get(this.key) as { value: string; hash: string } | undefined;
    if (!row) {
      this.hash = null;
      return null;
    }
    if (createHash("sha256").update(row.value).digest("hex") !== row.hash)
      throw new Error("白板远端分支材料损坏，已保留原日志");
    this.hash = row.hash;
    return JSON.parse(row.value, (_key, value) =>
      value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      typeof value.$bytes === "string"
        ? new Uint8Array(Buffer.from(value.$bytes, "base64"))
        : value
    );
  }
  async save(state: DocumentSyncState): Promise<void> {
    const value = JSON.stringify(state, (_key, value) =>
      value instanceof Uint8Array ? { $bytes: Buffer.from(value).toString("base64") } : value
    );
    const hash = createHash("sha256").update(value).digest("hex");
    const result =
      this.hash === null
        ? this.journal.db
            .prepare("INSERT INTO remote_branches VALUES (?,?,?) ON CONFLICT(scope) DO NOTHING")
            .run(this.key, value, hash)
        : this.journal.db
            .prepare("UPDATE remote_branches SET value=?,hash=? WHERE scope=? AND hash=?")
            .run(value, hash, this.key, this.hash);
    if (result.changes !== 1)
      throw new Error("白板远端日志已由另一会话更新，请重新打开，原分支已保留");
    this.hash = hash;
  }
}
export function whiteboardRemoteTransport(
  client: CollaborationClient,
  serverUrl: string,
  documentId: string
): DocumentSyncTransport {
  const path = `/v1/documents/${encodeURIComponent(documentId)}`;
  return {
    now: () => client.serverTime(serverUrl),
    peek: () => client.request<ConfirmedDocument["protocol"]>(serverUrl, `${path}/protocol`),
    async read() {
      const result = await client.request<{
        state: string;
        protocol: ConfirmedDocument["protocol"];
      }>(serverUrl, `${path}/state`, "GET", undefined, 3);
      return {
        state: new Uint8Array(Buffer.from(result.state, "base64")),
        protocol: result.protocol,
      };
    },
    async submit(request, update) {
      return (
        await client.request<{ operation: DocumentOperation }>(
          serverUrl,
          `${path}/operations/${encodeURIComponent(request.operationId)}`,
          "POST",
          { ...request, update: Buffer.from(update).toString("base64") }
        )
      ).operation;
    },
    async receipt(id) {
      return (
        await client.request<{ operation: DocumentOperation | null }>(
          serverUrl,
          `${path}/operations/${encodeURIComponent(id)}`
        )
      ).operation;
    },
    async cancel(request) {
      return (
        await client.request<{ operation: DocumentOperation }>(
          serverUrl,
          `${path}/operations/${encodeURIComponent(request.operationId)}/cancel`,
          "POST",
          request
        )
      ).operation;
    },
  };
}
export async function openWhiteboardRemoteSession(
  journal: WhiteboardJournal,
  client: CollaborationClient,
  serverUrl: string,
  documentId: string
) {
  const canonical = client.canonicalUrl(serverUrl);
  const identity = await client.identity(canonical);
  const session = await DocumentSyncSession.open(
    documentId,
    new WhiteboardRemoteJournal(journal, JSON.stringify([canonical, identity.id, documentId])),
    whiteboardRemoteTransport(client, canonical, documentId)
  );
  if (session.snapshot().confirmed.protocol.version !== 3) throw new Error("远端文档不是白板");
  return session;
}
