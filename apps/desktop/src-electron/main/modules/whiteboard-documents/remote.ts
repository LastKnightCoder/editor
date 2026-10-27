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
    journal.db.exec(`
      CREATE TABLE IF NOT EXISTS remote_branches (scope TEXT PRIMARY KEY, value TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS remote_receipts (scope TEXT NOT NULL, operation_id TEXT NOT NULL, value TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(scope,operation_id));
    `);
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
    const saved = JSON.parse(row.value, (_key, value) =>
      value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      typeof value.$bytes === "string"
        ? new Uint8Array(Buffer.from(value.$bytes, "base64"))
        : value
    ) as DocumentSyncState & { receipts?: DocumentOperation[] };
    if (saved.receipts) {
      const { receipts, ...state } = saved;
      this.write(
        state,
        receipts.map(receipt => {
          const {
            update: _update,
            baseline: _baseline,
            ...operation
          } = receipt as DocumentOperation & { update?: unknown; baseline?: unknown };
          return operation;
        })
      );
      return state;
    }
    return saved;
  }
  async receipt(operationId: string): Promise<DocumentOperation | null> {
    const row = this.journal.db
      .prepare("SELECT value,hash FROM remote_receipts WHERE scope=? AND operation_id=?")
      .get(this.key, operationId) as { value: string; hash: string } | undefined;
    if (!row) return null;
    if (createHash("sha256").update(row.value).digest("hex") !== row.hash)
      throw new Error("白板远端回执损坏，原记录已保留");
    return JSON.parse(row.value);
  }
  async save(state: DocumentSyncState, receipt?: DocumentOperation): Promise<void> {
    this.write(state, receipt ? [receipt] : []);
  }
  private write(state: DocumentSyncState, receipts: readonly DocumentOperation[]): void {
    const value = JSON.stringify(state, (_key, value) =>
      value instanceof Uint8Array ? { $bytes: Buffer.from(value).toString("base64") } : value
    );
    const hash = createHash("sha256").update(value).digest("hex");
    this.journal.db.transaction(() => {
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
      for (const receipt of receipts) {
        const encoded = JSON.stringify(receipt);
        const receiptHash = createHash("sha256").update(encoded).digest("hex");
        const previous = this.journal.db
          .prepare("SELECT hash FROM remote_receipts WHERE scope=? AND operation_id=?")
          .get(this.key, receipt.operationId) as { hash: string } | undefined;
        if (previous && previous.hash !== receiptHash) throw new Error("白板操作回执冲突");
        this.journal.db
          .prepare("INSERT OR IGNORE INTO remote_receipts VALUES(?,?,?,?)")
          .run(this.key, receipt.operationId, encoded, receiptHash);
      }
    })();
    this.hash = hash;
  }
}
export function whiteboardRemoteTransport(
  client: CollaborationClient,
  serverUrl: string,
  documentId: string
): DocumentSyncTransport {
  const path = `/v1/documents/${encodeURIComponent(documentId)}`;
  async function measuredRequest<T>(
    ...args: Parameters<CollaborationClient["request"]>
  ): Promise<T> {
    const started = performance.now();
    const operation = args[1].slice(path.length).split("/")[1] || "document";
    const operationId =
      operation === "operations" ? args[1].slice(path.length).split("/")[2] : undefined;
    try {
      const result = await client.request<T>(...args);
      console.info("[whiteboard-sync] HTTP 完成", {
        documentId,
        operation,
        operationId,
        method: args[2] ?? "GET",
        elapsedMs: Math.round(performance.now() - started),
      });
      return result;
    } catch (error) {
      const failure = (error ?? {}) as {
        name?: string;
        code?: string;
        status?: number;
        cause?: { code?: string };
      };
      console.warn("[whiteboard-sync] HTTP 失败", {
        documentId,
        operation,
        operationId,
        elapsedMs: Math.round(performance.now() - started),
        name: failure.name,
        code: failure.code,
        status: failure.status,
        cause: failure.cause?.code,
      });
      throw error;
    }
  }

  return {
    now: () => client.serverTime(serverUrl),
    peek: () => measuredRequest<ConfirmedDocument["protocol"]>(serverUrl, `${path}/protocol`),
    async read() {
      const result = await measuredRequest<{
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
        await measuredRequest<{ operation: DocumentOperation }>(
          serverUrl,
          `${path}/operations/${encodeURIComponent(request.operationId)}`,
          "POST",
          { ...request, update: Buffer.from(update).toString("base64") }
        )
      ).operation;
    },
    async receipt(id) {
      return (
        await measuredRequest<{ operation: DocumentOperation | null }>(
          serverUrl,
          `${path}/operations/${encodeURIComponent(id)}`
        )
      ).operation;
    },
    async cancel(request) {
      return (
        await measuredRequest<{ operation: DocumentOperation }>(
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
  const identity = await client.identity(serverUrl);
  const session = await DocumentSyncSession.open(
    documentId,
    new WhiteboardRemoteJournal(journal, JSON.stringify([serverUrl, identity.id, documentId])),
    whiteboardRemoteTransport(client, serverUrl, documentId)
  );
  if (session.snapshot().confirmed.protocol.version !== 3) throw new Error("远端文档不是白板");
  return session;
}
