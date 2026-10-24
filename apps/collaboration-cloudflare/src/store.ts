import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import * as Y from "yjs";
import {
  CollaborationError,
  readSharedContent,
  validateDocument,
  type DeviceIdentity,
  type JoinRequest,
  type Member,
  type SharedDocumentInfo,
} from "@tau/collaboration";

const DAY = 86_400_000;
const CHUNK_BYTES = 512 * 1024;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const fail = (code: string, message: string, status = 400): never => {
  throw new CollaborationError(code, message, status);
};
type DocumentRow = {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  creation_key: string;
  updated_at: number;
};
type DeviceRow = { id: string; nickname: string; secret_hash: string };

export class PrototypeStore {
  private readonly sql: SqlStorage;
  private readonly signingKey: string;

  constructor(private readonly storage: DurableObjectStorage) {
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, nickname TEXT NOT NULL, secret_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', creation_key TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner_id,creation_key));
      CREATE TABLE IF NOT EXISTS members(document_id TEXT NOT NULL, device_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(document_id,device_id));
      CREATE TABLE IF NOT EXISTS invitations(document_id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS join_requests(id TEXT PRIMARY KEY, document_id TEXT NOT NULL, device_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks(document_id TEXT NOT NULL, generation INTEGER NOT NULL, part INTEGER NOT NULL, state BLOB NOT NULL, PRIMARY KEY(document_id,generation,part));
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.sql.exec(
      "INSERT OR IGNORE INTO settings VALUES ('signing_key',?)",
      randomBytes(32).toString("hex")
    );
    this.signingKey = this.required<{ value: string }>(
      "SELECT value FROM settings WHERE key='signing_key'"
    ).value;
  }

  one<T>(sql: string, ...values: (string | number | ArrayBuffer)[]): T | undefined {
    return this.sql.exec(sql, ...values).toArray()[0] as T | undefined;
  }

  private required<T>(sql: string, ...values: (string | number)[]): T {
    return this.one<T>(sql, ...values) ?? fail("STORAGE_FAILED", "原型存储状态异常", 500);
  }

  all<T>(sql: string, ...values: (string | number)[]): T[] {
    return this.sql.exec(sql, ...values).toArray() as T[];
  }

  register(nickname: string): DeviceIdentity {
    if (this.required<{ count: number }>("SELECT count(*) AS count FROM devices").count >= 12)
      fail("PROTOTYPE_LIMIT", "原型最多创建 12 个设备", 429);
    const identity = {
      id: crypto.randomUUID(),
      secret: randomBytes(32).toString("base64url"),
      nickname,
    };
    this.sql.exec(
      "INSERT INTO devices VALUES (?,?,?)",
      identity.id,
      nickname,
      hash(identity.secret)
    );
    return identity;
  }

  authenticate(token: string): DeviceRow {
    const separator = token.indexOf(":");
    const device = this.one<DeviceRow>(
      "SELECT * FROM devices WHERE id=?",
      token.slice(0, separator)
    );
    const actual = Buffer.from(hash(token.slice(separator + 1)));
    const expected = Buffer.from(device?.secret_hash ?? hash(""));
    if (!device || !timingSafeEqual(actual, expected))
      return fail("UNAUTHORIZED", "身份凭据无效", 401);
    return device;
  }

  rename(id: string, nickname: string) {
    this.sql.exec("UPDATE devices SET nickname=? WHERE id=?", nickname, id);
    return { id, nickname };
  }

  document(id: string): DocumentRow {
    return (
      this.one<DocumentRow>("SELECT * FROM documents WHERE id=?", id) ??
      fail("NOT_FOUND", "协作文档不存在", 404)
    );
  }

  authorize(id: string, deviceId: string, owner = false, draft = false) {
    const row = this.document(id);
    const member = this.one<{ role: string }>(
      "SELECT role FROM members WHERE document_id=? AND device_id=?",
      id,
      deviceId
    );
    if (!member || (owner && member.role !== "owner")) fail("FORBIDDEN", "没有文档访问权限", 403);
    if (
      row.status === "closed" ||
      (row.status === "draft" && !(draft && row.owner_id === deviceId))
    )
      fail("DOCUMENT_CLOSED", "文档未发布或共享已结束", 410);
    return row;
  }

  create(deviceId: string, key: string) {
    return this.storage.transactionSync(() => {
      const previous = this.one<DocumentRow>(
        "SELECT * FROM documents WHERE owner_id=? AND creation_key=?",
        deviceId,
        key
      );
      if (previous) return previous;
      if (
        this.required<{ count: number }>(
          "SELECT count(*) AS count FROM documents WHERE status!='closed'"
        ).count >= 6
      )
        fail("PROTOTYPE_LIMIT", "原型最多同时保留 6 份文档", 429);
      const id = crypto.randomUUID();
      this.sql.exec(
        "INSERT INTO documents(id,owner_id,creation_key,updated_at) VALUES (?,?,?,?)",
        id,
        deviceId,
        key,
        Date.now()
      );
      this.sql.exec("INSERT INTO members VALUES (?,?,'owner')", id, deviceId);
      return this.document(id);
    });
  }

  private writeChunks(id: string, generation: number, state: Uint8Array) {
    // Buffer 的切片可能共享底层内存，必须只复制有效字节后再交给 SQLite。
    for (let offset = 0, part = 0; offset < state.byteLength; offset += CHUNK_BYTES, part++)
      this.sql.exec(
        "INSERT INTO chunks VALUES (?,?,?,?)",
        id,
        generation,
        part,
        Uint8Array.from(state.subarray(offset, offset + CHUNK_BYTES)).buffer
      );
  }

  publish(id: string, deviceId: string, state: Uint8Array) {
    this.authorize(id, deviceId, true, true);
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, state);
      const content = validateDocument(doc, MAX_DOCUMENT_BYTES);
      this.storage.transactionSync(() => {
        if (this.document(id).status === "active") return;
        this.writeChunks(id, 0, state);
        this.sql.exec(
          "UPDATE documents SET status='active',title=?,updated_at=? WHERE id=?",
          content.title,
          Date.now(),
          id
        );
      });
      return { documentId: id, published: true };
    } finally {
      doc.destroy();
    }
  }

  load(id: string): Y.Doc {
    const doc = new Y.Doc();
    const rows = this.all<{ generation: number; state: ArrayBuffer }>(
      "SELECT generation,state FROM chunks WHERE document_id=? ORDER BY generation,part",
      id
    );
    if (!rows.length) {
      doc.destroy();
      return fail("NOT_FOUND", "文档未发布", 404);
    }
    try {
      let generation = rows[0].generation;
      let parts: Uint8Array[] = [];
      const apply = () => {
        const state = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
        let offset = 0;
        for (const part of parts) {
          state.set(part, offset);
          offset += part.byteLength;
        }
        Y.applyUpdate(doc, state);
      };
      for (const row of rows) {
        if (row.generation !== generation) {
          apply();
          parts = [];
          generation = row.generation;
        }
        parts.push(new Uint8Array(row.state));
      }
      apply();
      return doc;
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }

  append(id: string, deviceId: string, update: Uint8Array, current: Y.Doc) {
    this.authorize(id, deviceId);
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
      Y.applyUpdate(candidate, update);
      const content = validateDocument(candidate, MAX_DOCUMENT_BYTES);
      const delta = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(current));
      this.storage.transactionSync(() => {
        const { generation } = this.required<{ generation: number }>(
          "SELECT coalesce(max(generation),0)+1 AS generation FROM chunks WHERE document_id=?",
          id
        );
        this.writeChunks(id, generation, delta);
        this.sql.exec(
          "UPDATE documents SET title=?,updated_at=? WHERE id=?",
          content.title,
          Date.now(),
          id
        );
      });
    } finally {
      candidate.destroy();
    }
  }

  compact(id: string) {
    if (this.document(id).status !== "active") return;
    const doc = this.load(id);
    try {
      const state = Y.encodeStateAsUpdate(doc);
      this.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM chunks WHERE document_id=?", id);
        this.writeChunks(id, 0, state);
      });
    } finally {
      doc.destroy();
    }
  }

  rotateCode(id: string, deviceId: string) {
    this.authorize(id, deviceId, true);
    const code = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = Date.now() + 7 * DAY;
    this.sql.exec(
      "INSERT INTO invitations VALUES (?,?,?) ON CONFLICT(document_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at",
      id,
      hash(code),
      expiresAt
    );
    return { code, expiresAt };
  }

  requestJoin(code: string, deviceId: string) {
    const invitation = this.one<{ document_id: string }>(
      "SELECT document_id FROM invitations WHERE code_hash=? AND expires_at>?",
      hash(code.replace(/[\s-]/g, "").toUpperCase()),
      Date.now()
    );
    if (!invitation) return fail("INVALID_CODE", "协作码无效", 404);
    const documentId = invitation.document_id;
    if (this.document(documentId).status !== "active")
      return fail("DOCUMENT_CLOSED", "共享已结束", 410);
    if (this.one("SELECT 1 FROM members WHERE document_id=? AND device_id=?", documentId, deviceId))
      return { status: "approved", documentId };
    const previous = this.one<{ id: string }>(
      "SELECT id FROM join_requests WHERE document_id=? AND device_id=? AND status='pending' AND expires_at>?",
      documentId,
      deviceId,
      Date.now()
    );
    const id = previous?.id ?? crypto.randomUUID();
    if (!previous)
      this.sql.exec(
        "INSERT INTO join_requests VALUES (?,?,?,'pending',?)",
        id,
        documentId,
        deviceId,
        Date.now() + DAY
      );
    return { id, status: "pending", documentId };
  }

  requests(deviceId: string): JoinRequest[] {
    return this.all(
      "SELECT r.id,r.document_id AS documentId,r.device_id AS deviceId,d.nickname,r.status,r.expires_at AS expiresAt FROM join_requests r JOIN documents a ON a.id=r.document_id JOIN devices d ON d.id=r.device_id WHERE a.owner_id=? AND r.status='pending' AND r.expires_at>?",
      deviceId,
      Date.now()
    );
  }

  decide(id: string, deviceId: string, approve: boolean) {
    return this.storage.transactionSync(() => {
      const request =
        this.one<{ document_id: string; device_id: string; status: string; expires_at: number }>(
          "SELECT * FROM join_requests WHERE id=?",
          id
        ) ?? fail("NOT_FOUND", "申请不存在", 404);
      this.authorize(request.document_id, deviceId, true);
      if (request.expires_at < Date.now()) fail("EXPIRED", "申请已过期", 410);
      if (request.status !== "pending") return;
      if (approve)
        this.sql.exec(
          "INSERT OR IGNORE INTO members VALUES (?,?,'editor')",
          request.document_id,
          request.device_id
        );
      this.sql.exec(
        "UPDATE join_requests SET status=? WHERE id=?",
        approve ? "approved" : "rejected",
        id
      );
    });
  }

  members(id: string): Omit<Member, "online" | "activity">[] {
    return this.all(
      "SELECT d.id AS deviceId,d.nickname,m.role FROM members m JOIN devices d ON d.id=m.device_id WHERE m.document_id=?",
      id
    );
  }

  list(deviceId: string): Omit<SharedDocumentInfo, "members">[] {
    return this.all(
      "SELECT d.id,d.title,d.owner_id AS ownerId,d.status,d.updated_at AS updatedAt,m.role FROM documents d JOIN members m ON d.id=m.document_id WHERE m.device_id=? AND d.status='active' ORDER BY d.updated_at DESC",
      deviceId
    );
  }

  remove(id: string, actorId: string, targetId: string) {
    const row = this.authorize(id, actorId, actorId !== targetId);
    if (row.owner_id === targetId) fail("OWNER_CANNOT_LEAVE", "作者请结束共享");
    this.sql.exec("DELETE FROM members WHERE document_id=? AND device_id=?", id, targetId);
  }

  close(id: string, deviceId: string) {
    this.authorize(id, deviceId, true);
    this.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE documents SET status='closed',creation_key=?,updated_at=? WHERE id=?",
        "closed:" + id,
        Date.now(),
        id
      );
      this.sql.exec("DELETE FROM chunks WHERE document_id=?", id);
      this.sql.exec("DELETE FROM invitations WHERE document_id=?", id);
    });
  }

  ticket(deviceId: string, documentId: string | null) {
    const body = Buffer.from(
      JSON.stringify({ deviceId, documentId, expires: Date.now() + 60_000 })
    ).toString("base64url");
    return body + "." + createHmac("sha256", this.signingKey).update(body).digest("base64url");
  }

  verifyTicket(token: string, documentId: string | null): DeviceRow {
    const [body, signature] = token.split(".");
    if (!body || !signature || token.length > 2000)
      return fail("UNAUTHORIZED", "连接票据无效", 401);
    const expected = createHmac("sha256", this.signingKey).update(body).digest("base64url");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return fail("UNAUTHORIZED", "连接票据无效", 401);
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      value.documentId !== documentId ||
      !Number.isFinite(value.expires) ||
      value.expires < Date.now()
    )
      return fail("UNAUTHORIZED", "连接票据已过期", 401);
    return (
      this.one<DeviceRow>("SELECT * FROM devices WHERE id=?", value.deviceId) ??
      fail("UNAUTHORIZED", "身份不存在", 401)
    );
  }

  snapshot(id: string) {
    const doc = this.load(id);
    try {
      return {
        state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
        title: readSharedContent(doc).title,
      };
    } finally {
      doc.destroy();
    }
  }
}
