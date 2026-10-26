import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import * as Y from "yjs";
import {
  CollaborationError,
  readSharedContent,
  validateDocument,
  DocumentProtocolStore,
  readDocumentProtocol,
  DocumentWriteQueue,
  DocumentOperationLedger,
  type DocumentOperation,
  type DocumentOperationRequest,
  applyStructuredDocumentUpdate,
  validateStructuredDocument,
  readDocumentProjection,
  collectDocumentResources,
  isStructuredDocumentVersion,
  type DocumentProtocol,
  type DocumentSql,
  ASSET_PREFIX,
  type DeviceIdentity,
  type JoinRequest,
  type Member,
  type SharedDocumentInfo,
} from "@tau/collaboration";

const DAY = 86_400_000;
const CHUNK_BYTES = 512 * 1024;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function assetReferences(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.startsWith(ASSET_PREFIX))
    into.add(value.slice(ASSET_PREFIX.length));
  else if (Array.isArray(value)) value.forEach(item => assetReferences(item, into));
  else if (value && typeof value === "object")
    Object.values(value).forEach(item => assetReferences(item, into));
  return into;
}
export const fail = (code: string, message: string, status = 400): never => {
  throw new CollaborationError(code, message, status);
};
type DocumentRow = {
  closed_revision: string | null;
  id: string;
  owner_id: string;
  title: string;
  status: string;
  creation_key: string;
  updated_at: number;
};
type DeviceRow = { id: string; nickname: string; secret_hash: string; banned: number };
export type AssetRow = {
  id: string;
  document_id: string;
  hash: string;
  name: string;
  mime: string;
  size: number;
  created_at: number;
  last_referenced_at: number;
};

export class CollaborationStore {
  private readonly sql: SqlStorage;
  private signingKey: string;
  readonly protocols: DocumentProtocolStore;
  readonly operations: DocumentOperationLedger;
  private readonly writes: DocumentWriteQueue;

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly prototype = true
  ) {
    this.sql = storage.sql;
    this.writes = new DocumentWriteQueue(MAX_DOCUMENT_BYTES * 2);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, nickname TEXT NOT NULL, secret_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', creation_key TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner_id,creation_key));
      CREATE TABLE IF NOT EXISTS members(document_id TEXT NOT NULL, device_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(document_id,device_id));
      CREATE TABLE IF NOT EXISTS invitations(document_id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS join_requests(id TEXT PRIMARY KEY, document_id TEXT NOT NULL, device_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks(document_id TEXT NOT NULL, generation INTEGER NOT NULL, part INTEGER NOT NULL, state BLOB NOT NULL, PRIMARY KEY(document_id,generation,part));
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, document_id TEXT NOT NULL, hash TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, last_referenced_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS assets_document ON assets(document_id);
      CREATE INDEX IF NOT EXISTS assets_hash ON assets(hash);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, device_id TEXT, document_id TEXT, action TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identity_merges(source_id TEXT PRIMARY KEY, target_id TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
    if (
      !this.all<{ name: string }>("PRAGMA table_info(devices)").some(row => row.name === "banned")
    )
      this.sql.exec("ALTER TABLE devices ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
    if (
      !this.all<{ name: string }>("PRAGMA table_info(documents)").some(
        row => row.name === "closed_revision"
      )
    )
      this.sql.exec("ALTER TABLE documents ADD COLUMN closed_revision TEXT");
    for (const table of ["devices", "documents"])
      if (
        !this.all<{ name: string }>("PRAGMA table_info(" + table + ")").some(
          row => row.name === "created_at"
        )
      )
        this.sql.exec("ALTER TABLE " + table + " ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0");
    if (
      !this.all<{ name: string }>("PRAGMA table_info(members)").some(row => row.name === "status")
    )
      this.sql.exec("ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    this.sql.exec(
      "INSERT OR IGNORE INTO settings VALUES ('signing_key',?)",
      randomBytes(32).toString("hex")
    );
    this.signingKey = this.required<{ value: string }>(
      "SELECT value FROM settings WHERE key='signing_key'"
    ).value;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS collaboration_asset_history (document_id TEXT NOT NULL, epoch INTEGER NOT NULL, asset_id TEXT NOT NULL, PRIMARY KEY(document_id,epoch,asset_id))"
    );
    const ledgerSql: DocumentSql = {
      exec: (sql, ...parameters) => {
        this.sql.exec(sql, ...parameters);
      },
      get: <T>(sql: string, ...parameters: (string | number | null)[]) =>
        this.sql.exec(sql, ...parameters).toArray()[0] as T | undefined,
      transaction: action => this.storage.transactionSync(action),
    };
    this.operations = new DocumentOperationLedger(ledgerSql, Date.now, id => {
      const seen = new Set<string>();
      while (!seen.has(id)) {
        seen.add(id);
        const row = this.one<{ target_id: string }>(
          "SELECT target_id FROM identity_merges WHERE source_id=?",
          id
        );
        if (!row) return id;
        id = row.target_id;
      }
      return fail("IDENTITY_CONFLICT", "设备身份映射循环", 409);
    });
    this.protocols = new DocumentProtocolStore(
      ledgerSql,
      id => this.currentProtocol(id),
      id => {
        const visited = new Set<string>();
        while (!visited.has(id)) {
          visited.add(id);
          const row = this.one<{ target_id: string }>(
            "SELECT target_id FROM identity_merges WHERE source_id=?",
            id
          );
          if (!row) return id;
          id = row.target_id;
        }
        return fail("IDENTITY_CONFLICT", "设备身份映射循环", 409);
      }
    );
  }

  private currentProtocol(id: string): DocumentProtocol {
    const row = this.document(id),
      doc = this.load(id);
    try {
      const meta = doc.getMap("meta");
      return {
        id,
        ownerId: row.owner_id,
        version: Number(meta.get("version") ?? 1),
        epoch: Number(meta.get("epoch") ?? 0),
        baselineId: String(meta.get("baselineId") ?? `legacy:${id}`),
        revision: createHash("sha256").update(Y.encodeStateAsUpdate(doc)).digest("hex"),
      };
    } finally {
      doc.destroy();
    }
  }

  private retainedContent(doc: Y.Doc) {
    return isStructuredDocumentVersion(doc.getMap("meta").get("version"))
      ? readDocumentProjection(doc)
      : readSharedContent(doc);
  }

  private documentAssets(doc: Y.Doc): Set<string> {
    return assetReferences(
      isStructuredDocumentVersion(doc.getMap("meta").get("version"))
        ? collectDocumentResources(doc)
        : readSharedContent(doc)
    );
  }

  private retainAssets(id: string, epoch: number, doc: Y.Doc): void {
    for (const assetId of this.documentAssets(doc))
      this.sql.exec(
        "INSERT OR IGNORE INTO collaboration_asset_history(document_id,epoch,asset_id) VALUES (?,?,?)",
        id,
        epoch,
        assetId
      );
  }

  async submitOperation(
    id: string,
    actorId: string,
    request: DocumentOperationRequest,
    update?: Uint8Array,
    cancel = false,
    memoryBudget: number | (() => number) = MAX_DOCUMENT_BYTES
  ) {
    this.authorize(id, actorId);
    if (
      !cancel &&
      (!update ||
        update.byteLength > MAX_DOCUMENT_BYTES ||
        createHash("sha256").update(update).digest("hex") !== request.updateHash)
    )
      return fail("INVALID_OPERATION", "编辑增量摘要或大小不匹配", 400);
    if (
      typeof request.operationId === "string" &&
      !this.operations.get(id, request.operationId, actorId)
    )
      this.ensureCapacity(4096);
    const operation = this.operations.begin(id, actorId, request);
    // 未确认提案可能缺依赖，无法完整扫描；先保守持有该房间已上传的资源，退役由恢复流程负责。
    this.sql.exec(
      "INSERT OR IGNORE INTO collaboration_asset_history SELECT document_id,?,id FROM assets WHERE document_id=?",
      this.protocols.state(id).epoch,
      id
    );
    if (cancel) return this.operations.abort(operation, "cancelled");
    if (operation.state !== "PENDING") return operation;
    try {
      const protocol = this.protocols.state(id);
      if (
        protocol.epoch !== request.epoch ||
        protocol.baselineId !== request.baselineId ||
        protocol.version !== request.version
      )
        return this.operations.abort(operation, "EPOCH_CONFLICT");
      return await this.appendNodeUpdate(
        id,
        actorId,
        update!,
        undefined,
        protocol,
        memoryBudget,
        operation
      );
    } catch (error) {
      if (
        error instanceof CollaborationError &&
        !["MISSING_DEPENDENCIES", "CAPACITY"].includes(error.code)
      )
        return this.operations.abort(operation, error.code);
      throw error;
    }
  }

  private appendNodeUpdate(
    id: string,
    deviceId: string,
    update: Uint8Array,
    current: Y.Doc | undefined,
    protocol: DocumentProtocol,
    memoryBudget: number | (() => number),
    operation?: DocumentOperation
  ): Promise<void | DocumentOperation> {
    const payload = update.slice();
    return this.writes.run(id, payload.byteLength, async () => {
      this.writable();
      this.authorize(id, deviceId);
      if (operation) {
        const stored = this.operations.get(id, operation.operationId, deviceId)!;
        if (stored.state !== "PENDING") return stored;
      }
      this.protocols.assertWritable(id, protocol);
      const before = this.load(id);
      let candidate: Y.Doc | undefined;
      try {
        candidate = await applyStructuredDocumentUpdate(before, payload, {
          documentId: id,
          epoch: protocol.epoch,
          baselineId: protocol.baselineId!,
        });
        if (
          Y.encodeStateAsUpdate(candidate).byteLength >
          (typeof memoryBudget === "function" ? memoryBudget() : memoryBudget)
        )
          return fail("CAPACITY", "活动文档内存预算已满，请稍后重试", 429);
        const content = readDocumentProjection(candidate),
          delta = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(before));
        const previousRevision = createHash("sha256")
          .update(Y.encodeStateAsUpdate(before))
          .digest("hex");
        // 与落盘重载使用相同的 GC 编码，删除文字后的摘要也必须一致。
        Y.applyUpdate(before, delta);
        const revision = createHash("sha256").update(Y.encodeStateAsUpdate(before)).digest("hex");
        const install = () => {
          this.writable();
          this.authorize(id, deviceId);
          this.protocols.assertWritable(id, protocol);
          if (
            Y.encodeStateAsUpdate(candidate!).byteLength >
            (typeof memoryBudget === "function" ? memoryBudget() : memoryBudget)
          )
            return fail("CAPACITY", "活动文档内存预算已满，请稍后重试", 429);
          if (revision === previousRevision) return;
          this.ensureCapacity(delta.byteLength);
          this.validateAssets(id, content, candidate);
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
          this.retainAssets(id, protocol.epoch, candidate!);
          this.operations.advance(id);
          this.protocols.updateRevision(id, revision);
        };
        const result = operation
          ? this.operations.commit(
              operation,
              () => {
                this.authorize(id, deviceId);
                return this.protocols.assertWritable(id, protocol);
              },
              revision,
              install
            )
          : this.storage.transactionSync(install);
        if (result && result.state !== "COMMITTED") return result;
        if (current) Y.applyUpdate(current, Y.encodeStateAsUpdate(candidate));
        return result;
      } finally {
        before.destroy();
        candidate?.destroy();
      }
    });
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

  private writable() {
    if (this.setting("maintenance") === "1")
      fail("MAINTENANCE", "协作服务正在维护，请稍后重试", 503);
  }

  private audit(deviceId: string, documentId: string, action: string) {
    this.sql.exec(
      "INSERT INTO audit(device_id,document_id,action,created_at) VALUES (?,?,?,?)",
      deviceId,
      documentId,
      action,
      Date.now()
    );
  }

  register(nickname: string): DeviceIdentity {
    this.writable();
    if (
      this.prototype &&
      this.required<{ count: number }>("SELECT count(*) AS count FROM devices").count >= 12
    )
      fail("PROTOTYPE_LIMIT", "原型最多创建 12 个设备", 429);
    const identity = {
      id: crypto.randomUUID(),
      secret: randomBytes(32).toString("base64url"),
      nickname,
    };
    this.sql.exec(
      "INSERT INTO devices(id,nickname,secret_hash,created_at) VALUES (?,?,?,?)",
      identity.id,
      nickname,
      hash(identity.secret),
      Date.now()
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
    if (!device || device.banned || !timingSafeEqual(actual, expected))
      return fail("UNAUTHORIZED", "身份凭据无效", 401);
    return device;
  }

  rename(id: string, nickname: string) {
    this.writable();
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
      "SELECT role FROM members WHERE document_id=? AND device_id=? AND status='active'",
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
    this.writable();
    return this.storage.transactionSync(() => {
      const previous = this.one<DocumentRow>(
        "SELECT * FROM documents WHERE owner_id=? AND creation_key=?",
        deviceId,
        key
      );
      if (previous) return previous;
      if (
        this.prototype &&
        this.required<{ count: number }>(
          "SELECT count(*) AS count FROM documents WHERE status!='closed'"
        ).count >= 6
      )
        fail("PROTOTYPE_LIMIT", "原型最多同时保留 6 份文档", 429);
      if (
        this.required<{ count: number }>(
          "SELECT count(*) AS count FROM documents WHERE owner_id=? AND status!='closed'",
          deviceId
        ).count >= 5
      )
        fail("DOCUMENT_LIMIT", "已达到共享内容数量上限", 429);
      const id = crypto.randomUUID();
      this.sql.exec(
        "INSERT INTO documents(id,owner_id,creation_key,updated_at,created_at) VALUES (?,?,?,?,?)",
        id,
        deviceId,
        key,
        Date.now(),
        Date.now()
      );
      this.sql.exec(
        "INSERT INTO members(document_id,device_id,role) VALUES (?,?,'owner')",
        id,
        deviceId
      );
      this.audit(deviceId, id, "created");
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
    this.writable();
    this.authorize(id, deviceId, true, true);
    if (state.byteLength > MAX_DOCUMENT_BYTES) fail("INVALID_CONTENT", "协作文档超过大小限制", 400);
    const doc = new Y.Doc();
    try {
      try {
        Y.applyUpdate(doc, state);
      } catch {
        throw new CollaborationError("INVALID_CONTENT", "文档状态损坏或不兼容", 400);
      }
      if (doc.store.pendingStructs || doc.store.pendingDs)
        throw new CollaborationError("MISSING_DEPENDENCIES", "发布状态缺少先行结构", 400);
      if (isStructuredDocumentVersion(doc.getMap("meta").get("version")))
        return this.publishNodeDocument(id, deviceId, state.slice());
      const content = validateDocument(doc, MAX_DOCUMENT_BYTES);
      this.validateAssets(id, content);
      this.storage.transactionSync(() => {
        if (this.document(id).status === "active") return;
        this.ensureCapacity(state.byteLength);
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

  private publishNodeDocument(id: string, deviceId: string, state: Uint8Array) {
    return this.writes.run(id, state.byteLength, async () => {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, state);
        const baselineId = String(doc.getMap("meta").get("baselineId") ?? "");
        await validateStructuredDocument(doc, { documentId: id, baselineId, epoch: 0 });
        const canonical = Y.encodeStateAsUpdate(doc),
          content = readDocumentProjection(doc);
        this.writable();
        this.authorize(id, deviceId, true, true);
        this.validateAssets(id, content, doc);
        const awaitHash = createHash("sha256").update(canonical).digest("hex");
        this.storage.transactionSync(() => {
          this.protocols.publish(
            {
              id,
              ownerId: deviceId,
              epoch: 0,
              revision: awaitHash,
              version: Number(doc.getMap("meta").get("version")),
              baselineId,
            },
            () => {
              if (this.document(id).status !== "draft")
                fail("PUBLICATION_CONFLICT", "原发布回执缺失，不能重建房间", 409);
              this.ensureCapacity(canonical.byteLength);
              this.writeChunks(id, 0, canonical);
              this.sql.exec(
                "UPDATE documents SET status='active',title=?,updated_at=? WHERE id=?",
                content.title,
                Date.now(),
                id
              );
              this.retainAssets(id, 0, doc);
            }
          );
        });
        return { documentId: id, published: true };
      } finally {
        doc.destroy();
      }
    });
  }

  publicationStatus(id: string, actorId: string) {
    const row = this.document(id);
    if (row.owner_id !== actorId) fail("FORBIDDEN", "只有所有者可以读取发布回执", 403);
    const receipt = this.protocols.publication(id);
    return {
      state: receipt ? "COMMITTED" : row.status === "closed" ? "ABORTED" : "PENDING",
      receipt,
    };
  }
  cancelPublication(id: string, actorId: string) {
    this.writable();
    return this.storage.transactionSync(() => {
      const status = this.publicationStatus(id, actorId);
      if (status.state === "PENDING")
        this.sql.exec(
          "UPDATE documents SET status='closed',updated_at=? WHERE id=? AND status='draft'",
          Date.now(),
          id
        );
      return this.publicationStatus(id, actorId);
    });
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

  append(
    id: string,
    deviceId: string,
    update: Uint8Array,
    current: Y.Doc,
    memoryBudget: number | (() => number) = MAX_DOCUMENT_BYTES,
    expected?: DocumentProtocol
  ) {
    this.writable();
    this.authorize(id, deviceId);
    const protocol = this.protocols.assertWritable(id, expected);
    if (isStructuredDocumentVersion(protocol.version)) {
      const meta = current.getMap("meta");
      if (meta.get("epoch") !== protocol.epoch || meta.get("baselineId") !== protocol.baselineId)
        return fail("EPOCH_CONFLICT", "活动会话属于旧文档基线", 409);
      return this.appendNodeUpdate(id, deviceId, update, current, protocol, memoryBudget);
    }
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
      Y.applyUpdate(candidate, update);
      if (candidate.store.pendingStructs || candidate.store.pendingDs)
        return fail("MISSING_DEPENDENCIES", "更新缺少先行结构，尚未确认持久化", 409);
      const content = validateDocument(candidate, MAX_DOCUMENT_BYTES);
      if (
        Y.encodeStateAsUpdate(candidate).byteLength >
        (typeof memoryBudget === "function" ? memoryBudget() : memoryBudget)
      )
        fail("CAPACITY", "活动文档内存预算已满，请稍后重试", 429);
      this.validateAssets(id, content);
      const delta = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(current));
      this.storage.transactionSync(() => {
        this.ensureCapacity(delta.byteLength);
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
    if (this.document(id).status !== "active") return [];
    const doc = this.load(id);
    try {
      const state = Y.encodeStateAsUpdate(doc);
      return this.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM chunks WHERE document_id=?", id);
        this.writeChunks(id, 0, state);
        const now = Date.now();
        const references = this.documentAssets(doc);
        this.all<{ asset_id: string }>(
          "SELECT asset_id FROM collaboration_asset_history WHERE document_id=?",
          id
        ).forEach(row => references.add(row.asset_id));
        for (const assetId of references)
          this.sql.exec(
            "UPDATE assets SET last_referenced_at=? WHERE document_id=? AND id=?",
            now,
            id,
            assetId
          );
        const stale = this.all<AssetRow>(
          "SELECT * FROM assets WHERE document_id=? AND last_referenced_at<?",
          id,
          now - 7 * DAY
        );
        this.sql.exec(
          "DELETE FROM assets WHERE document_id=? AND last_referenced_at<?",
          id,
          now - 7 * DAY
        );
        return stale.map(row => row.hash);
      });
    } finally {
      doc.destroy();
    }
  }

  rotateCode(id: string, deviceId: string) {
    this.writable();
    this.authorize(id, deviceId, true);
    const code = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = Date.now() + 7 * DAY;
    this.sql.exec(
      "INSERT INTO invitations VALUES (?,?,?) ON CONFLICT(document_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at",
      id,
      hash(code),
      expiresAt
    );
    this.audit(deviceId, id, "invitation_rotated");
    return { code, expiresAt };
  }

  requestJoin(code: string, deviceId: string) {
    this.writable();
    const invitation = this.one<{ document_id: string }>(
      "SELECT document_id FROM invitations WHERE code_hash=? AND expires_at>?",
      hash(code.replace(/[\s-]/g, "").toUpperCase()),
      Date.now()
    );
    if (!invitation) return fail("INVALID_CODE", "协作码无效", 404);
    const documentId = invitation.document_id;
    if (this.document(documentId).status !== "active")
      return fail("DOCUMENT_CLOSED", "共享已结束", 410);
    if (
      this.one(
        "SELECT 1 FROM members WHERE document_id=? AND device_id=? AND status='active'",
        documentId,
        deviceId
      )
    )
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
    this.writable();
    return this.storage.transactionSync(() => {
      const request =
        this.one<{ document_id: string; device_id: string; status: string; expires_at: number }>(
          "SELECT * FROM join_requests WHERE id=?",
          id
        ) ?? fail("NOT_FOUND", "申请不存在", 404);
      this.authorize(request.document_id, deviceId, true);
      if (request.expires_at < Date.now()) fail("EXPIRED", "申请已过期", 410);
      if (request.status !== "pending") return;
      if (approve && this.members(request.document_id).length >= 10)
        fail("MEMBER_LIMIT", "成员数量已达到上限", 429);
      if (approve)
        this.sql.exec(
          "INSERT INTO members(document_id,device_id,role) VALUES (?,?,'editor') ON CONFLICT(document_id,device_id) DO UPDATE SET status='active'",
          request.document_id,
          request.device_id
        );
      this.sql.exec(
        "UPDATE join_requests SET status=? WHERE id=?",
        approve ? "approved" : "rejected",
        id
      );
      this.audit(deviceId, request.document_id, approve ? "approved" : "rejected");
    });
  }

  members(id: string): Omit<Member, "online" | "activity">[] {
    return this.all(
      "SELECT d.id AS deviceId,d.nickname,m.role FROM members m JOIN devices d ON d.id=m.device_id WHERE m.document_id=? AND m.status='active'",
      id
    );
  }

  list(deviceId: string): Omit<SharedDocumentInfo, "members">[] {
    return this.all(
      "SELECT d.id,d.title,d.owner_id AS ownerId,d.status,d.updated_at AS updatedAt,m.role FROM documents d JOIN members m ON d.id=m.document_id WHERE m.device_id=? AND m.status='active' AND d.status='active' ORDER BY d.updated_at DESC",
      deviceId
    );
  }

  remove(id: string, actorId: string, targetId: string) {
    this.writable();
    const row = this.authorize(id, actorId, actorId !== targetId);
    if (row.owner_id === targetId) fail("OWNER_CANNOT_LEAVE", "作者请结束共享");
    this.sql.exec(
      "UPDATE members SET status='removed' WHERE document_id=? AND device_id=?",
      id,
      targetId
    );
    this.audit(actorId, id, "member_removed");
  }

  close(id: string, deviceId: string, expectedRevision?: string) {
    this.writable();
    const document = this.document(id);
    if (document.owner_id !== deviceId) fail("FORBIDDEN", "只有作者可以结束共享", 403);
    if (document.status === "closed") {
      if (expectedRevision !== undefined && expectedRevision !== document.closed_revision)
        fail("REVISION_CONFLICT", "共享由另一修订结束，请保留本机副本", 409);
      return document.closed_revision;
    }
    this.authorize(id, deviceId, true);
    const protocol = this.currentProtocol(id);
    if (
      (protocol.version > 1 && expectedRevision === undefined) ||
      (expectedRevision !== undefined && expectedRevision !== protocol.revision)
    )
      fail("REVISION_CONFLICT", "正文已变化，请重新保全后再结束共享", 409);
    this.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE documents SET status='closed',updated_at=?,closed_revision=? WHERE id=?",
        Date.now(),
        protocol.revision,
        id
      );
      this.sql.exec("DELETE FROM chunks WHERE document_id=?", id);
      this.sql.exec("DELETE FROM invitations WHERE document_id=?", id);
      this.sql.exec("DELETE FROM join_requests WHERE document_id=?", id);
      this.sql.exec("DELETE FROM assets WHERE document_id=?", id);
      this.audit(deviceId, id, "closed");
    });
    this.protocols.invalidate(id);
    return protocol.revision;
  }

  ticket(
    deviceId: string,
    documentId: string | null,
    protocolVersion?: number,
    expected?: Pick<DocumentProtocol, "epoch" | "baselineId">
  ) {
    const protocol = documentId ? this.protocols.state(documentId) : undefined;
    if (
      protocol &&
      (protocol.version === 3 || expected) &&
      (expected?.epoch !== protocol.epoch || expected?.baselineId !== protocol.baselineId)
    )
      return fail("EPOCH_CONFLICT", "申请白板票据须声明匹配的本机基线与代次", 409);
    if (protocol && protocol.version > 1 && protocolVersion !== protocol.version)
      return fail("CLIENT_UPGRADE_REQUIRED", "请使用支持当前文档协议的客户端", 409);
    const body = Buffer.from(
      JSON.stringify({ deviceId, documentId, expires: Date.now() + 60_000, protocol })
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
    if (documentId) {
      const protocol = this.protocols.state(documentId);
      if (
        !value.protocol ||
        value.protocol.epoch !== protocol.epoch ||
        value.protocol.version !== protocol.version ||
        value.protocol.baselineId !== protocol.baselineId
      )
        return fail("EPOCH_CONFLICT", "连接票据属于旧文档基线", 409);
    }
    return (
      this.one<DeviceRow>("SELECT * FROM devices WHERE id=? AND banned=0", value.deviceId) ??
      fail("UNAUTHORIZED", "身份不存在", 401)
    );
  }

  snapshot(id: string) {
    const doc = this.load(id);
    try {
      return {
        state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
        protocol: { ...this.protocols.state(id), sequence: this.operations.sequence(id) },
        title: this.retainedContent(doc).title,
      };
    } finally {
      doc.destroy();
    }
  }

  setting(key: string): string | undefined {
    return this.one<{ value: string }>("SELECT value FROM settings WHERE key=?", key)?.value;
  }

  setSetting(key: string, value: string) {
    this.sql.exec(
      "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      value
    );
  }

  storageBytes() {
    return this.required<{ bytes: number }>(
      "SELECT (SELECT coalesce(sum(size),0) FROM assets)+(SELECT coalesce(sum(length(state)),0) FROM chunks)+(SELECT coalesce(sum(length(value)),0) FROM collaboration_operations)+(SELECT count(*)*256 FROM collaboration_asset_history) AS bytes"
    ).bytes;
  }

  ensureCapacity(bytes: number) {
    if (this.storageBytes() + bytes > 5 * 1024 ** 3)
      fail("STORAGE_LIMIT", "协作存储配额已用尽", 507);
  }

  documentBytes(id: string) {
    return this.required<{ bytes: number }>(
      "SELECT coalesce(sum(length(state)),0) AS bytes FROM chunks WHERE document_id=?",
      id
    ).bytes;
  }

  asset(id: string, assetId: string): AssetRow | undefined {
    return this.one<AssetRow>("SELECT * FROM assets WHERE document_id=? AND id=?", id, assetId);
  }

  assets(id: string): AssetRow[] {
    return this.all("SELECT * FROM assets WHERE document_id=?", id);
  }

  retainedAssetIds(id: string): string[] {
    const doc = this.load(id);
    try {
      return [
        ...new Set([
          ...this.documentAssets(doc),
          ...this.all<{ asset_id: string }>(
            "SELECT DISTINCT asset_id FROM collaboration_asset_history WHERE document_id=?",
            id
          ).map(row => row.asset_id),
        ]),
      ];
    } finally {
      doc.destroy();
    }
  }

  insertAsset(row: AssetRow) {
    this.writable();
    return this.storage.transactionSync(() => {
      const duplicate = this.one<AssetRow>(
        "SELECT * FROM assets WHERE document_id=? AND hash=?",
        row.document_id,
        row.hash
      );
      if (duplicate && duplicate.id === row.id) return duplicate;
      const existing = this.one<AssetRow>("SELECT * FROM assets WHERE id=?", row.id);
      if (existing) fail("ASSET_CONFLICT", "资源标识已被使用", 409);
      const used = this.required<{ bytes: number }>(
        "SELECT coalesce(sum(size),0) AS bytes FROM assets WHERE document_id=?",
        row.document_id
      ).bytes;
      if (used + row.size > 200 * 1024 * 1024) fail("ASSET_LIMIT", "文档资源配额已用尽", 413);
      this.ensureCapacity(row.size);
      this.sql.exec(
        "INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)",
        row.id,
        row.document_id,
        row.hash,
        row.name,
        row.mime,
        row.size,
        row.created_at,
        row.last_referenced_at
      );
      return row;
    });
  }

  assetByHash(id: string, digest: string) {
    return this.one<AssetRow>("SELECT * FROM assets WHERE document_id=? AND hash=?", id, digest);
  }

  hashReferenced(digest: string) {
    return !!this.one("SELECT 1 FROM assets WHERE hash=? LIMIT 1", digest);
  }

  private validateAssets(id: string, value: unknown, doc?: Y.Doc) {
    const known = new Set(this.assets(id).map(row => row.id));
    for (const assetId of doc ? this.documentAssets(doc) : assetReferences(value))
      if (!known.has(assetId)) fail("INVALID_ASSET", "资源不属于这篇共享内容");
  }

  mergeIdentity(target: string, sourceToken: string) {
    this.writable();
    const separator = sourceToken.indexOf(":");
    const sourceId = sourceToken.slice(0, separator);
    const previous = this.one<{ target_id: string }>(
      "SELECT target_id FROM identity_merges WHERE source_id=?",
      sourceId
    );
    if (previous?.target_id === target) {
      const device = this.one<DeviceRow>("SELECT * FROM devices WHERE id=?", sourceId);
      if (
        device &&
        timingSafeEqual(
          Buffer.from(device.secret_hash),
          Buffer.from(hash(sourceToken.slice(separator + 1)))
        )
      )
        return { id: target };
      return fail("UNAUTHORIZED", "身份凭据无效", 401);
    }
    const source = this.authenticate(sourceToken);
    if (source.id === target) return { id: target };
    this.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE documents SET creation_key=creation_key||':identity:'||id WHERE owner_id=?",
        source.id
      );
      this.sql.exec("UPDATE documents SET owner_id=? WHERE owner_id=?", target, source.id);
      for (const row of this.all<{ document_id: string; role: string }>(
        "SELECT document_id,role FROM members WHERE device_id=? AND status='active'",
        source.id
      )) {
        this.sql.exec(
          "INSERT INTO members(document_id,device_id,role) VALUES (?,?,?) ON CONFLICT(document_id,device_id) DO UPDATE SET status='active',role=CASE WHEN members.role='owner' OR excluded.role='owner' THEN 'owner' ELSE 'editor' END",
          row.document_id,
          target,
          row.role
        );
      }
      this.sql.exec("DELETE FROM members WHERE device_id=?", source.id);
      this.sql.exec("UPDATE join_requests SET device_id=? WHERE device_id=?", target, source.id);
      this.sql.exec("UPDATE devices SET banned=1 WHERE id=?", source.id);
      this.sql.exec("INSERT INTO identity_merges VALUES (?,?,?)", source.id, target, Date.now());
    });
    return { id: target };
  }

  exportMetadata() {
    return {
      format: 4,
      signingKey: this.signingKey,
      tables: Object.fromEntries(
        [
          "devices",
          "documents",
          "members",
          "invitations",
          "join_requests",
          "assets",
          "audit",
          "identity_merges",
          "collaboration_protocol",
          "collaboration_asset_history",
          "collaboration_operations",
          "collaboration_sequences",
        ].map(table => [table, this.all<Record<string, unknown>>("SELECT * FROM " + table)])
      ),
    };
  }

  beginImport(data: unknown) {
    if (this.setting("ready") === "1") fail("ALREADY_READY", "正式库已开放，不能覆盖导入", 409);
    if (!data || typeof data !== "object") fail("INVALID_IMPORT", "迁移数据无效");
    const input = data as ReturnType<CollaborationStore["exportMetadata"]>;
    if (input.format !== 4 || !/^[a-f0-9]{64}$/.test(input.signingKey) || !input.tables)
      fail("INVALID_IMPORT", "备份清单格式不受支持");
    if (Object.hasOwn(input.tables, "collaboration_migrations"))
      fail("INVALID_IMPORT", "备份包含已退役的格式迁移账本");
    if (!Array.isArray(input.tables.collaboration_protocol))
      fail("INVALID_IMPORT", "备份清单缺少 collaboration_protocol");
    for (const row of input.tables.collaboration_protocol) {
      try {
        if (typeof row?.value !== "string") throw new Error("协议记录无效");
        readDocumentProtocol(row.value);
      } catch {
        fail("INVALID_IMPORT", "备份协议记录无效或包含已退役的格式迁移状态");
      }
    }
    const columns: Record<string, string[]> = {
      devices: ["id", "nickname", "secret_hash", "banned", "created_at"],
      documents: [
        "id",
        "owner_id",
        "title",
        "status",
        "creation_key",
        "updated_at",
        "created_at",
        "closed_revision",
      ],
      members: ["document_id", "device_id", "role", "status"],
      invitations: ["document_id", "code_hash", "expires_at"],
      join_requests: ["id", "document_id", "device_id", "status", "expires_at"],
      assets: [
        "id",
        "document_id",
        "hash",
        "name",
        "mime",
        "size",
        "created_at",
        "last_referenced_at",
      ],
      audit: ["id", "device_id", "document_id", "action", "created_at"],
      identity_merges: ["source_id", "target_id", "created_at"],
      collaboration_protocol: ["document_id", "value"],
      collaboration_operations: ["document_id", "operation_id", "value"],
      collaboration_sequences: ["document_id", "sequence"],
      collaboration_asset_history: ["document_id", "epoch", "asset_id"],
    };
    this.protocols.invalidate();
    this.storage.transactionSync(() => {
      for (const table of [...Object.keys(columns), "chunks"])
        this.sql.exec("DELETE FROM " + table);
      for (const [table, fields] of Object.entries(columns)) {
        const rows = input.tables[table];
        if (!Array.isArray(rows)) fail("INVALID_IMPORT", "迁移清单缺少 " + table);
        for (const row of rows) {
          const values = fields.map(field => {
            const value = row[field];
            if (value !== null && typeof value !== "string" && typeof value !== "number")
              fail("INVALID_IMPORT", "迁移字段无效：" + table + "." + field);
            return value as string | number | null;
          });
          this.sql.exec(
            "INSERT INTO " +
              table +
              "(" +
              fields.join(",") +
              ") VALUES (" +
              fields.map(() => "?").join(",") +
              ")",
            ...values
          );
        }
      }
      this.setSetting("signing_key", input.signingKey);
      this.setSetting("import_format", String(input.format));
      this.setSetting(
        "import_counts",
        JSON.stringify(
          Object.fromEntries(
            Object.keys(columns).map(table => [table, input.tables[table]?.length ?? 0])
          )
        )
      );
      this.setSetting("ready", "0");
    });
    this.signingKey = input.signingKey;
    return this.status();
  }

  async importState(id: string, state: Uint8Array) {
    if (this.setting("ready") === "1") fail("ALREADY_READY", "正式库已开放，不能覆盖导入", 409);
    if (this.document(id).status !== "active") fail("INVALID_IMPORT", "只允许导入活动文档状态");
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, state);
      if (isStructuredDocumentVersion(doc.getMap("meta").get("version"))) {
        if (this.setting("import_format") !== "4")
          return fail("INVALID_IMPORT", "正文备份必须携带当前协议、编辑回执及历史资产清单");
        await validateStructuredDocument(doc, {
          documentId: id,
          epoch: Number(doc.getMap("meta").get("epoch")),
          baselineId: String(doc.getMap("meta").get("baselineId") ?? ""),
        });
      } else validateDocument(doc, MAX_DOCUMENT_BYTES);
      this.protocols.invalidate(id);
      this.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM chunks WHERE document_id=?", id);
        this.writeChunks(id, 0, state);
      });
    } finally {
      doc.destroy();
    }
  }

  async finishImport() {
    const expected = JSON.parse(this.setting("import_counts") ?? "{}") as Record<string, number>;
    if (!Object.keys(expected).length) fail("INVALID_IMPORT", "尚未导入元数据");
    for (const [table, count] of Object.entries(this.status().counts))
      if (expected[table] !== count) fail("INVALID_IMPORT", "迁移数量不一致：" + table);
    for (const row of this.all<{ id: string }>("SELECT id FROM documents WHERE status='active'")) {
      const doc = this.load(row.id);
      try {
        if (isStructuredDocumentVersion(doc.getMap("meta").get("version"))) {
          await validateStructuredDocument(doc, {
            documentId: row.id,
            epoch: Number(doc.getMap("meta").get("epoch")),
            baselineId: String(doc.getMap("meta").get("baselineId") ?? ""),
          });
          this.protocols.state(row.id);
          this.validateAssets(row.id, readDocumentProjection(doc), doc);
        } else this.validateAssets(row.id, validateDocument(doc, MAX_DOCUMENT_BYTES));
      } finally {
        doc.destroy();
      }
    }
    this.ensureCapacity(0);
    this.setSetting("ready", "1");
    return this.status();
  }

  status() {
    const tables = [
      "devices",
      "documents",
      "members",
      "invitations",
      "join_requests",
      "assets",
      "audit",
      "identity_merges",
      "collaboration_protocol",
      "collaboration_asset_history",
      "collaboration_operations",
      "collaboration_sequences",
    ];
    return {
      ready: this.setting("ready") === "1",
      counts: Object.fromEntries(
        tables.map(table => [
          table,
          this.required<{ count: number }>("SELECT count(*) AS count FROM " + table).count,
        ])
      ),
      storageBytes: this.storageBytes(),
    };
  }
}
