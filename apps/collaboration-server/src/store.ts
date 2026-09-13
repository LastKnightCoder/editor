import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, timingSafeEqual, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, statfsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import {
  ASSET_PREFIX,
  CollaborationError,
  readSharedContent,
  validateDocument,
  type DeviceIdentity,
  type JoinRequest,
  type JoinRequestResult,
  type Member,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import type { ServerConfig } from "./config";

const DAY = 86400000;
// 资产解除引用后的保留窗口：覆盖客户端撤销删除导致引用复活的场景
const ASSET_GC_GRACE = 7 * DAY;
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const fail = (code: string, message: string, status = 400): never => {
  throw new CollaborationError(code, message, status);
};

/** 深度遍历任意结构，收集全部资源引用（tau-collab-asset:<id> 字符串）。 */
function collectAssetReferences(value: unknown, into: Set<string>) {
  if (typeof value === "string") {
    if (value.startsWith(ASSET_PREFIX)) into.add(value.slice(ASSET_PREFIX.length));
  } else if (Array.isArray(value)) value.forEach(entry => collectAssetReferences(entry, into));
  else if (value && typeof value === "object")
    Object.values(value).forEach(entry => collectAssetReferences(entry, into));
}

interface DocumentRow {
  id: string;
  owner_id: string;
  creation_key: string;
  title: string;
  status: "draft" | "active" | "closed";
  updated_at: number;
  created_at: number;
}
interface DeviceRow {
  id: string;
  nickname: string;
  secret_hash: string;
  banned: number;
}

export class CollaborationStore {
  readonly db: Database.Database;
  readonly secret: Buffer;
  private storageCheckedAt = 0;
  private diskCheckedAt = 0;
  private cachedStorageBytes = -1;
  private assetIds = new Map<string, Set<string>>();

  constructor(readonly config: ServerConfig) {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    mkdirSync(join(config.dataDir, "assets"), { recursive: true, mode: 0o700 });
    mkdirSync(join(config.dataDir, "tmp"), { recursive: true, mode: 0o700 });
    const secretPath = join(config.dataDir, "signing.key");
    try {
      writeFileSync(secretPath, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    this.secret = readFileSync(secretPath);
    if (this.secret.length < 32)
      throw new Error(`签名密钥文件异常（${secretPath}），请删除后重启以重新生成`);
    this.db = new Database(join(config.dataDir, "collaboration.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    if (Number(this.db.pragma("user_version", { simple: true })) > 1)
      throw new Error("数据库版本高于当前服务，请使用匹配镜像或恢复备份");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, nickname TEXT NOT NULL, banned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES devices(id), title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', creation_key TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner_id, creation_key));
      CREATE TABLE IF NOT EXISTS members (document_id TEXT NOT NULL REFERENCES documents(id), device_id TEXT NOT NULL REFERENCES devices(id), role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', PRIMARY KEY(document_id, device_id));
      CREATE TABLE IF NOT EXISTS invitations (document_id TEXT PRIMARY KEY REFERENCES documents(id), code_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS join_requests (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), device_id TEXT NOT NULL REFERENCES devices(id), status TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS join_requests_document ON join_requests(document_id, status);
      CREATE TABLE IF NOT EXISTS snapshots (document_id TEXT PRIMARY KEY REFERENCES documents(id), state BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS updates (seq INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL REFERENCES documents(id), hash TEXT NOT NULL, state BLOB NOT NULL, UNIQUE(document_id, hash));
      CREATE INDEX IF NOT EXISTS updates_document ON updates(document_id, seq);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), hash TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, last_referenced_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, device_id TEXT, document_id TEXT, action TEXT NOT NULL, created_at INTEGER NOT NULL);
      PRAGMA user_version = 1;
    `);
    if (
      !(this.db.prepare("PRAGMA table_info(assets)").all() as { name: string }[]).some(
        column => column.name === "last_referenced_at"
      )
    )
      this.db.exec("ALTER TABLE assets ADD COLUMN last_referenced_at INTEGER NOT NULL DEFAULT 0");
  }

  audit(deviceId: string, documentId: string, action: string) {
    this.db
      .prepare("INSERT INTO audit(device_id, document_id, action, created_at) VALUES (?, ?, ?, ?)")
      .run(deviceId, documentId, action, Date.now());
  }

  register(nickname: string): DeviceIdentity {
    const id = randomUUID();
    const secret = randomBytes(32).toString("base64url");
    this.db
      .prepare("INSERT INTO devices(id, secret_hash, nickname, created_at) VALUES (?, ?, ?, ?)")
      .run(id, digest(secret), nickname, Date.now());
    return { id, secret, nickname };
  }

  authenticate(token: string): DeviceRow {
    const separator = token.indexOf(":");
    const id = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    const device = this.db.prepare("SELECT * FROM devices WHERE id = ?").get(id) as
      DeviceRow | undefined;
    const digestBuffer = Buffer.from(digest(secret));
    const expected = device ? Buffer.from(device.secret_hash) : digestBuffer;
    // 等长比较避免 timingSafeEqual 抛异常；设备不存在时也执行一次比较，不泄露 ID 是否存在。
    const secretMatches =
      expected.length === 64 &&
      digestBuffer.length === 64 &&
      timingSafeEqual(expected, digestBuffer);
    if (!device || device.banned || !secretMatches)
      fail("UNAUTHORIZED", "身份凭据无效或已停用", 401);
    return device!;
  }

  ticket(deviceId: string, documentId: string | null): string {
    const body = Buffer.from(
      JSON.stringify({ deviceId, documentId, expires: Date.now() + 60000 })
    ).toString("base64url");
    return `${body}.${createHmac("sha256", this.secret).update(body).digest("base64url")}`;
  }

  verifyTicket(token: string, documentId: string | null): DeviceRow {
    const [body, signature] = token.split(".");
    if (!body || !signature || token.length > 2000) fail("UNAUTHORIZED", "连接票据无效", 401);
    const expected = createHmac("sha256", this.secret).update(body).digest("base64url");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      fail("UNAUTHORIZED", "连接票据无效", 401);
    let payload: {
      deviceId: string;
      documentId: string | null;
      expires: number;
    };
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString());
    } catch {
      return fail("UNAUTHORIZED", "连接票据无效", 401);
    }
    if (
      payload.documentId !== documentId ||
      !Number.isFinite(payload.expires) ||
      payload.expires < Date.now()
    )
      fail("UNAUTHORIZED", "连接票据已过期", 401);
    const device = this.db
      .prepare("SELECT * FROM devices WHERE id = ? AND banned = 0")
      .get(payload.deviceId) as DeviceRow | undefined;
    if (!device) fail("UNAUTHORIZED", "身份已停用", 401);
    return device!;
  }

  document(id: string): DocumentRow {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
      DocumentRow | undefined;
    if (!row) fail("NOT_FOUND", "共享内容不存在", 404);
    return row!;
  }

  authorize(id: string, deviceId: string, owner = false, allowDraft = false): DocumentRow {
    const row = this.document(id);
    const member = this.db
      .prepare(
        "SELECT role FROM members WHERE document_id = ? AND device_id = ? AND status = 'active'"
      )
      .get(id, deviceId) as { role: string } | undefined;
    const device = this.db.prepare("SELECT banned FROM devices WHERE id = ?").get(deviceId) as
      { banned: number } | undefined;
    if (!device || device.banned || !member || (owner && member.role !== "owner"))
      fail("FORBIDDEN", "没有这段内容的访问权限", 403);
    if (
      row.status === "closed" ||
      (row.status === "draft" && !(allowDraft && row.owner_id === deviceId))
    )
      fail("DOCUMENT_CLOSED", "共享已结束或尚未发布", 410);
    return row;
  }

  create(deviceId: string, key: string) {
    return this.db.transaction(() => {
      const existing = this.db
        .prepare("SELECT * FROM documents WHERE owner_id = ? AND creation_key = ?")
        .get(deviceId, key) as DocumentRow | undefined;
      if (existing) {
        if (existing.status !== "closed") return existing;
        // 历史关闭房间仍受唯一索引约束，先归档幂等键再创建新房间。
        this.db
          .prepare("UPDATE documents SET creation_key=? WHERE id=?")
          .run(`${existing.creation_key}:closed:${existing.id}`, existing.id);
      }
      const count = (
        this.db
          .prepare(
            "SELECT count(*) AS count FROM documents WHERE owner_id = ? AND status != 'closed'"
          )
          .get(deviceId) as { count: number }
      ).count;
      if (count >= this.config.maxDocumentsPerDevice)
        fail("DOCUMENT_LIMIT", "已达到共享内容数量上限", 429);
      this.ensureCapacity(0);
      const id = randomUUID();
      const now = Date.now();
      this.db
        .prepare(
          "INSERT INTO documents(id, owner_id, creation_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(id, deviceId, key, now, now);
      this.db
        .prepare("INSERT INTO members(document_id, device_id, role) VALUES (?, ?, 'owner')")
        .run(id, deviceId);
      this.audit(deviceId, id, "created");
      return this.document(id);
    })();
  }

  publish(id: string, deviceId: string, state: Uint8Array) {
    this.authorize(id, deviceId, true, true);
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, state);
      const article = validateDocument(doc, this.config.maxDocumentBytes);
      this.validateAssets(id, article);
      return this.db.transaction(() => {
        // 状态检查放在事务内，两个并发 publish 只有一个生效，另一个按幂等处理。
        const row = this.document(id);
        if (row.status === "active") return { documentId: id, published: true };
        this.ensureCapacity(state.byteLength);
        this.db
          .prepare(
            "INSERT INTO snapshots(document_id, state) VALUES (?, ?) ON CONFLICT(document_id) DO NOTHING"
          )
          .run(id, Buffer.from(state));
        const changes = this.db
          .prepare(
            "UPDATE documents SET title = ?, status = 'active', updated_at = ? WHERE id = ? AND status = 'draft'"
          )
          .run(article.title, Date.now(), id).changes;
        if (!changes) return { documentId: id, published: true };
        this.accountBytes(state.byteLength);
        return { documentId: id, published: true };
      })();
    } finally {
      doc.destroy();
    }
  }

  rotateCode(id: string, deviceId: string) {
    this.authorize(id, deviceId, true);
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const code = Array.from(randomBytes(12), value => alphabet[value % alphabet.length]).join("");
    const expiresAt = Date.now() + 7 * DAY;
    this.db
      .prepare(
        "INSERT INTO invitations(document_id, code_hash, expires_at) VALUES (?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at"
      )
      .run(id, digest(code), expiresAt);
    this.audit(deviceId, id, "invitation_rotated");
    return { code, expiresAt };
  }

  requestJoin(code: string, deviceId: string): JoinRequestResult {
    const invitation = this.db
      .prepare("SELECT document_id FROM invitations WHERE code_hash = ? AND expires_at > ?")
      .get(digest(code.replace(/[\s-]/g, "").toUpperCase()), Date.now()) as
      { document_id: string } | undefined;
    if (!invitation || this.document(invitation.document_id).status !== "active")
      fail("INVALID_CODE", "协作码无效或已过期", 404);
    const documentId = invitation!.document_id;
    const member = this.db
      .prepare(
        "SELECT 1 FROM members WHERE document_id = ? AND device_id = ? AND status = 'active'"
      )
      .get(documentId, deviceId);
    if (member) return { status: "approved", documentId };
    const pending = this.db
      .prepare(
        "SELECT id FROM join_requests WHERE document_id = ? AND device_id = ? AND status = 'pending' AND expires_at > ?"
      )
      .get(documentId, deviceId, Date.now()) as { id: string } | undefined;
    if (pending) return { id: pending.id, status: "pending", documentId };
    const id = randomUUID();
    const now = Date.now();
    this.db
      .prepare("INSERT INTO join_requests VALUES (?, ?, ?, 'pending', ?, ?)")
      .run(id, documentId, deviceId, now + DAY, now);
    return { id, status: "pending", documentId };
  }

  /** 待处理申请列表（只返回未过期的 pending；过期与否由 expires_at 判定，读路径不写库，
   *  decide 对过期申请显式报 EXPIRED）。 */
  requests(deviceId: string): JoinRequest[] {
    return this.db
      .prepare(
        "SELECT r.id, r.document_id AS documentId, r.device_id AS deviceId, d.nickname, r.status, r.expires_at AS expiresAt FROM join_requests r JOIN devices d ON d.id=r.device_id JOIN documents a ON a.id=r.document_id WHERE a.owner_id = ? AND a.status='active' AND r.status='pending' AND r.expires_at > ? ORDER BY r.created_at"
      )
      .all(deviceId, Date.now()) as JoinRequest[];
  }

  decide(requestId: string, deviceId: string, approve: boolean): string {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM join_requests WHERE id = ?").get(requestId) as
        | {
            document_id: string;
            device_id: string;
            status: string;
            expires_at: number;
          }
        | undefined;
      if (!row) return fail("NOT_FOUND", "申请不存在", 404);
      this.authorize(row.document_id, deviceId, true);
      if (row.status !== "pending") return row.document_id;
      if (row.expires_at < Date.now()) return fail("EXPIRED", "申请已过期", 410);
      if (approve) {
        const count = (
          this.db
            .prepare(
              "SELECT count(*) AS count FROM members WHERE document_id=? AND status='active'"
            )
            .get(row.document_id) as { count: number }
        ).count;
        if (count >= this.config.maxMembers) fail("MEMBER_LIMIT", "成员数量已达到上限", 429);
        this.db
          .prepare(
            "INSERT INTO members(document_id,device_id,role,status) VALUES (?,?,'editor','active') ON CONFLICT(document_id,device_id) DO UPDATE SET status='active'"
          )
          .run(row.document_id, row.device_id);
      }
      this.db
        .prepare("UPDATE join_requests SET status=? WHERE id=?")
        .run(approve ? "approved" : "rejected", requestId);
      this.audit(deviceId, row.document_id, approve ? "approved" : "rejected");
      return row.document_id;
    })();
  }

  /** 成员的持久化字段；在线态与活动状态由服务层按实时连接合并。 */
  members(id: string): Omit<Member, "online" | "activity">[] {
    return this.db
      .prepare(
        "SELECT m.device_id AS deviceId, d.nickname, m.role FROM members m JOIN devices d ON d.id=m.device_id WHERE m.document_id=? AND m.status='active'"
      )
      .all(id) as Omit<Member, "online" | "activity">[];
  }

  /** 一次取回该设备全部文档的成员（文档列表避免逐文档查询）；在线态由服务层合并。 */
  membersOf(deviceId: string): Map<string, Omit<Member, "online" | "activity">[]> {
    const grouped = new Map<string, Omit<Member, "online" | "activity">[]>();
    const rows = this.db
      .prepare(
        "SELECT m.document_id AS documentId, m.device_id AS deviceId, d.nickname, m.role FROM members m JOIN devices d ON d.id=m.device_id WHERE m.status='active' AND m.document_id IN (SELECT document_id FROM members WHERE device_id=? AND status='active') ORDER BY m.document_id"
      )
      .all(deviceId) as (Omit<Member, "online" | "activity"> & { documentId: string })[];
    for (const row of rows) {
      const list = grouped.get(row.documentId);
      if (list) list.push(row);
      else grouped.set(row.documentId, [row]);
    }
    return grouped;
  }

  /** 仅返回文档元数据；带在线状态的成员列表由路由层组装，避免 O(文档×成员) 重复查询。 */
  list(deviceId: string): Omit<SharedDocumentInfo, "members">[] {
    return this.db
      .prepare(
        "SELECT d.id,d.title,d.owner_id AS ownerId,d.status,d.updated_at AS updatedAt,m.role FROM documents d JOIN members m ON d.id=m.document_id WHERE m.device_id=? AND m.status='active' AND d.status='active' ORDER BY d.updated_at DESC"
      )
      .all(deviceId) as Omit<SharedDocumentInfo, "members">[];
  }

  removeMember(id: string, actorId: string, targetId: string) {
    const row = this.authorize(id, actorId, actorId !== targetId);
    if (row.owner_id === targetId) fail("OWNER_CANNOT_LEAVE", "作者请使用结束共享");
    this.db
      .prepare("UPDATE members SET status='removed' WHERE document_id=? AND device_id=?")
      .run(id, targetId);
    this.audit(actorId, id, "member_removed");
  }

  closeDocument(id: string, deviceId: string) {
    const row = this.document(id);
    if (row.owner_id !== deviceId) fail("FORBIDDEN", "只有作者可以结束共享", 403);
    if (row.status === "closed") return;
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE documents SET status='closed', creation_key=?, updated_at=? WHERE id=?")
        .run(`${row.creation_key}:closed:${row.id}`, Date.now(), id);
      this.db.prepare("DELETE FROM invitations WHERE document_id=?").run(id);
      this.db.prepare("DELETE FROM join_requests WHERE document_id=?").run(id);
    })();
    this.discardDocumentData(id);
    this.audit(deviceId, id, "closed");
  }

  /** 结束共享后清空正文、增量和附件，回收存储配额；文档行和审计记录保留。 */
  private discardDocumentData(id: string) {
    const hashes = this.db
      .prepare("SELECT DISTINCT hash FROM assets WHERE document_id=?")
      .all(id) as { hash: string }[];
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM updates WHERE document_id=?").run(id);
      this.db.prepare("DELETE FROM snapshots WHERE document_id=?").run(id);
      this.db.prepare("DELETE FROM assets WHERE document_id=?").run(id);
    })();
    for (const { hash } of hashes) this.unlinkIfOrphan(hash);
    this.assetIds.delete(id);
    this.cachedStorageBytes = -1;
  }

  loadDocument(id: string): Y.Doc {
    const doc = new Y.Doc();
    const snapshot = this.db.prepare("SELECT state FROM snapshots WHERE document_id=?").get(id) as
      { state: Buffer } | undefined;
    if (!snapshot) {
      doc.destroy();
      return fail("NOT_FOUND", "共享内容尚未发布", 404);
    }
    try {
      Y.applyUpdate(doc, snapshot.state);
      for (const row of this.db
        .prepare("SELECT state FROM updates WHERE document_id=? ORDER BY seq")
        .all(id) as { state: Buffer }[])
        Y.applyUpdate(doc, row.state);
      return doc;
    } catch (error) {
      doc.destroy();
      throw error;
    }
  }

  appendUpdate(id: string, deviceId: string, update: Uint8Array, current: Y.Doc) {
    this.authorize(id, deviceId);
    const hash = digest(update);
    if (this.db.prepare("SELECT 1 FROM updates WHERE document_id=? AND hash=?").get(id, hash))
      return;
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
      Y.applyUpdate(candidate, update);
      const article = validateDocument(candidate, this.config.maxDocumentBytes);
      this.validateAssets(id, article);
      this.db.transaction(() => {
        this.ensureCapacity(update.byteLength);
        this.db
          .prepare("INSERT INTO updates(document_id,hash,state) VALUES (?,?,?)")
          .run(id, hash, Buffer.from(update));
        this.db
          .prepare("UPDATE documents SET title=?,updated_at=? WHERE id=?")
          .run(article.title, Date.now(), id);
        this.accountBytes(update.byteLength);
      })();
    } finally {
      candidate.destroy();
    }
  }

  compact(id: string) {
    const obsoleteHashes: string[] = [];
    this.db.transaction(() => {
      const doc = this.loadDocument(id);
      try {
        this.db
          .prepare("UPDATE snapshots SET state=? WHERE document_id=?")
          .run(Buffer.from(Y.encodeStateAsUpdate(doc)), id);
        this.db.prepare("DELETE FROM updates WHERE document_id=?").run(id);
        obsoleteHashes.push(...this.pruneUnreferencedAssets(id, doc));
      } finally {
        doc.destroy();
      }
    })();
    for (const hash of obsoleteHashes) this.unlinkIfOrphan(hash);
    this.cachedStorageBytes = -1;
  }

  /** 文件可能被其他文档共享：仍被引用时保留，否则删除；文件缺失不算错误。 */
  private unlinkIfOrphan(hash: string) {
    const shared = this.db.prepare("SELECT 1 FROM assets WHERE hash=? LIMIT 1").get(hash);
    if (!shared)
      try {
        unlinkSync(join(this.config.dataDir, "assets", hash));
      } catch {
        // 文件缺失不影响关闭/清理流程。
      }
  }

  /**
   * 文档压缩时回收孤儿资产：刷新仍被引用资产的引用时间，
   * 删除超过宽限期未被引用的资产行。宽限期覆盖客户端撤销删除
   * 导致引用复活的场景；返回待释放的文件哈希（可能仍被其他文档共享）。
   */
  private pruneUnreferencedAssets(id: string, doc: Y.Doc) {
    const referenced = new Set<string>();
    collectAssetReferences(readSharedContent(doc), referenced);
    const now = Date.now();
    const refresh = this.db.prepare(
      "UPDATE assets SET last_referenced_at=? WHERE document_id=? AND id=?"
    );
    for (const assetId of referenced) refresh.run(now, id, assetId);
    const stale = this.db
      .prepare("SELECT id,hash FROM assets WHERE document_id=? AND last_referenced_at<?")
      .all(id, now - ASSET_GC_GRACE) as { id: string; hash: string }[];
    if (!stale.length) return [];
    const remove = this.db.prepare("DELETE FROM assets WHERE document_id=? AND id=?");
    const known = this.assetIds.get(id);
    for (const asset of stale) {
      remove.run(id, asset.id);
      known?.delete(asset.id);
    }
    return stale.map(asset => asset.hash);
  }

  validateAssets(id: string, value: unknown) {
    let known = this.assetIds.get(id);
    if (!known) {
      known = new Set(
        (
          this.db.prepare("SELECT id FROM assets WHERE document_id=?").all(id) as { id: string }[]
        ).map(row => row.id)
      );
      this.assetIds.set(id, known);
    }
    const referenced = new Set<string>();
    collectAssetReferences(value, referenced);
    for (const assetId of referenced)
      if (!known!.has(assetId)) fail("INVALID_ASSET", "资源不属于这篇共享内容");
  }

  noteAsset(id: string, assetId: string) {
    let known = this.assetIds.get(id);
    if (!known) {
      known = new Set();
      this.assetIds.set(id, known);
    }
    known.add(assetId);
  }

  storageBytes(): number {
    const now = Date.now();
    if (this.cachedStorageBytes >= 0 && now - this.storageCheckedAt < 5000)
      return this.cachedStorageBytes;
    const row = this.db
      .prepare(
        "SELECT (SELECT coalesce(sum(size),0) FROM assets) + (SELECT coalesce(sum(length(state)),0) FROM snapshots) + (SELECT coalesce(sum(length(state)),0) FROM updates) AS bytes"
      )
      .get() as { bytes: number };
    this.cachedStorageBytes = row.bytes;
    this.storageCheckedAt = now;
    return row.bytes;
  }

  /** 已知写入量同步记账，配合短 TTL 缓存避免配额超卖。 */
  private accountBytes(delta: number) {
    if (this.cachedStorageBytes >= 0) this.cachedStorageBytes += delta;
  }

  ensureCapacity(bytes: number) {
    if (this.storageBytes() + bytes > this.config.maxStorageBytes)
      fail("STORAGE_LIMIT", "服务器存储配额已用尽", 507);
    // 磁盘检查涉及系统调用，短时间内复用结果。
    const now = Date.now();
    if (now - this.diskCheckedAt < 30000) return;
    const fs = statfsSync(this.config.dataDir);
    this.diskCheckedAt = now;
    if (fs.bavail * fs.bsize < bytes + 128 * 1024 * 1024)
      fail("DISK_FULL", "服务器剩余磁盘空间不足", 507);
  }

  insertAsset(
    documentId: string,
    assetId: string,
    hash: string,
    name: string,
    mime: string,
    size: number
  ) {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO assets(id,document_id,hash,name,mime,size,created_at,last_referenced_at) VALUES (?,?,?,?,?,?,?,?)"
      )
      .run(assetId, documentId, hash, name, mime, size, now, now);
    this.noteAsset(documentId, assetId);
    this.accountBytes(size);
  }

  close() {
    this.db.close();
  }
}
