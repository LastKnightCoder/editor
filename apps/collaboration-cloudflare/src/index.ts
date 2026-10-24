import { DurableObject } from "cloudflare:workers";
import { createHash, timingSafeEqual } from "node:crypto";
import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { CollaborationError, type CollaborationEvent, type Member } from "@tau/collaboration";
import { MAX_DOCUMENT_BYTES, CollaborationStore, fail } from "./store";
import { assetRequest, AssetOperations } from "./assets";

interface Env {
  COLLAB: DurableObjectNamespace<CollaborationService>;
  PROTOTYPE_KEY: string;
  BUILD_REV: string;
  MODE?: string;
  PUBLIC_URL?: string;
  INSTANCE_NAME?: string;
  ADMIN_KEY?: string;
  LEGACY_ORIGIN_HASHES?: string;
  ASSETS?: R2Bucket;
  BACKUPS?: R2Bucket;
  REQUEST_LIMITER?: RateLimit;
  DEVICE_LIMITER?: RateLimit;
}

const field = (body: Record<string, unknown>, key: string, max = 200): string => {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max)
    return fail("INVALID_FIELD", key + " 格式不正确");
  return value.trim();
};

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) return fail("INVALID_BODY", "缺少请求正文");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DOCUMENT_BYTES * 1.4 + 2048) {
      await reader.cancel();
      return fail("BODY_TOO_LARGE", "请求正文超过限制", 413);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  if (size === 0) return {};
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body))
    return fail("INVALID_BODY", "请求正文必须是对象");
  return body;
}

export class CollaborationService extends DurableObject<Env> {
  private readonly store: CollaborationStore;
  private hocuspocus?: Hocuspocus<{ deviceId: string; nickname: string }>;
  private readonly sockets = new Set<WebSocket>();
  private readonly events = new Map<WebSocket, string>();
  private readonly assetOperations = new AssetOperations();
  private readonly messageRates = new Map<
    string,
    { startedAt: number; messages: number; awareness: number }
  >();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new CollaborationStore(ctx.storage, env.MODE !== "production");
  }

  private admin(request: Request) {
    const expected = this.env.MODE === "production" ? this.env.ADMIN_KEY : this.env.PROTOTYPE_KEY;
    const actual = request.headers.get(
      this.env.MODE === "production" ? "x-admin-key" : "x-prototype-key"
    );
    if (!expected || !actual) return fail("FORBIDDEN", "需要原型访问凭据", 403);
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(actual), digest(expected)))
      fail("FORBIDDEN", "原型访问凭据无效", 403);
  }

  private identity(request: Request) {
    const token = request.headers.get("authorization");
    if (!token?.startsWith("Bearer ")) return fail("UNAUTHORIZED", "缺少设备身份", 401);
    return this.store.authenticate(token.slice(7));
  }

  private send(deviceId: string, event: CollaborationEvent) {
    for (const [socket, id] of this.events) {
      if (id === deviceId && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(event));
    }
  }

  private refresh() {
    for (const id of new Set(this.events.values())) this.send(id, { type: "refresh" });
  }

  private members(documentId: string): Member[] {
    const doc = this.hocuspocus?.documents.get(documentId);
    const online = new Map<string, Member["activity"]>();
    for (const connection of doc?.getConnections() ?? [])
      online.set(connection.context.deviceId, "background");
    for (const state of doc?.awareness.getStates().values() ?? []) {
      if (typeof state.user?.id === "string" && online.has(state.user.id)) {
        if (state.activity === "editing" || state.activity === "viewing")
          online.set(state.user.id, state.activity);
      }
    }
    return this.store.members(documentId).map(member => ({
      ...member,
      online: online.has(member.deviceId),
      activity: online.get(member.deviceId) ?? "background",
    }));
  }

  private presence(documentId: string) {
    const members = this.members(documentId);
    for (const member of members)
      this.send(member.deviceId, { type: "presence", documentId, members });
  }

  private runtime() {
    this.hocuspocus ??= new Hocuspocus<{ deviceId: string; nickname: string }>({
      quiet: true,
      debounce: 100,
      maxDebounce: 1000,
      timeout: 60_000,
      maxUnauthenticatedQueueSize: MAX_DOCUMENT_BYTES + 65_536,
      onAuthenticate: async ({ token, documentName }) => {
        const device = this.store.verifyTicket(token, documentName);
        this.store.authorize(documentName, device.id);
        const runtime = this.hocuspocus;
        if (!runtime) return fail("RUNTIME_STOPPED", "协作运行时已停止", 503);
        if (!runtime.documents.has(documentName) && runtime.getDocumentsCount() >= 4)
          if (this.env.MODE !== "production")
            return fail("CAPACITY", "原型最多同时打开 4 份文档", 429);
        if (runtime.getDocumentsCount() >= 20) return fail("CAPACITY", "活动文档数量已满", 429);
        return { deviceId: device.id, nickname: device.nickname };
      },
      onLoadDocument: async ({ documentName, document }) => {
        const occupied = [...(this.hocuspocus?.documents.keys() ?? [])]
          .filter(id => id !== documentName)
          .reduce((bytes, id) => bytes + this.store.documentBytes(id), 0);
        if (occupied + this.store.documentBytes(documentName) > 12 * 1024 * 1024)
          return fail("CAPACITY", "活动文档内存预算已满，请稍后重试", 429);
        const loaded = this.store.load(documentName);
        try {
          Y.applyUpdate(document, Y.encodeStateAsUpdate(loaded));
        } finally {
          loaded.destroy();
        }
        return document;
      },
      beforeHandleMessage: async ({ documentName, context, update, socketId }) => {
        if (this.store.setting("maintenance") === "1")
          throw new Error("服务正在维护，请重连后继续同步");
        this.store.authorize(documentName, context.deviceId);
        const now = Date.now();
        const previous = this.messageRates.get(socketId);
        const rate =
          previous && now - previous.startedAt < 60_000
            ? previous
            : { startedAt: now, messages: 0, awareness: 0 };
        rate.messages++;
        this.messageRates.set(socketId, rate);
        if (rate.messages > 3000) throw new Error("编辑请求过于频繁");
        if (update.byteLength > MAX_DOCUMENT_BYTES + 65_536) throw new Error("协作消息超过限制");
      },
      beforeSync: async ({ type, payload, context, documentName, document }) => {
        if (type === 1 || type === 2) {
          const others = [...(this.hocuspocus?.documents.keys() ?? [])]
            .filter(id => id !== documentName)
            .reduce((bytes, id) => bytes + this.store.documentBytes(id), 0);
          this.store.append(
            documentName,
            context.deviceId,
            payload,
            document,
            Math.min(MAX_DOCUMENT_BYTES, 12 * 1024 * 1024 - others)
          );
        }
      },
      beforeHandleAwareness: async ({ context, documentName, states, socketId }) => {
        if (!context) throw new Error("连接状态异常");
        this.store.authorize(documentName, context.deviceId);
        const rate = socketId ? this.messageRates.get(socketId) : undefined;
        if (rate && ++rate.awareness > 600) throw new Error("在线状态更新过于频繁");
        if (states.size > 16 || JSON.stringify([...states]).length > 16_384)
          throw new Error("在线状态超过限制");
        for (const state of states.values()) {
          state.user = { id: context.deviceId, name: context.nickname };
          if (!["editing", "viewing", "background"].includes(state.activity))
            state.activity = "background";
        }
      },
      onStoreDocument: async ({ documentName }) => {
        for (const digest of this.store.compact(documentName))
          await this.assetOperations.run(digest, async () => {
            if (!this.store.hashReferenced(digest))
              await this.env.ASSETS?.delete("assets/" + digest);
          });
      },
      connected: async ({ documentName }) => {
        this.presence(documentName);
      },
      onAwarenessUpdate: async ({ documentName }) => {
        this.presence(documentName);
      },
      onDisconnect: async ({ documentName, socketId }) => {
        this.messageRates.delete(socketId);
        this.presence(documentName);
      },
      onStateless: async () => {
        throw new Error("原型不支持自定义广播");
      },
    });
    return this.hocuspocus;
  }

  private openSocket(request: Request, path: string) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return fail("UPGRADE_REQUIRED", "需要 WebSocket 连接", 426);
    if (this.sockets.size >= (this.env.MODE === "production" ? 100 : 24))
      return fail("CAPACITY", "协作连接数量已满", 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hocuspocus 解码器接收二进制缓冲区，不能沿用 WebSocket 的 Blob 默认值。
    server.binaryType = "arraybuffer";
    server.accept();
    this.sockets.add(server);
    const remove = () => {
      this.sockets.delete(server);
      this.events.delete(server);
    };
    server.addEventListener("error", remove);
    if (path === "/ws") {
      const connection = this.runtime().handleConnection(server, request);
      let queue = Promise.resolve();
      server.addEventListener("message", event => {
        queue = queue
          .then(async () => {
            if (
              typeof event.data === "string" ||
              event.data.byteLength > MAX_DOCUMENT_BYTES + 65_536
            )
              throw new Error("协作消息格式或大小无效");
            await connection.handleMessage(new Uint8Array(event.data));
          })
          .catch(() => server.close(1008, "协作消息被拒绝"));
      });
      server.addEventListener("close", event => {
        remove();
        connection.handleClose(event);
      });
    } else {
      const timer = setTimeout(() => server.close(4401, "连接鉴权超时"), 10_000);
      server.addEventListener("message", event => {
        try {
          if (this.events.has(server)) return;
          if (typeof event.data !== "string" || event.data.length > 4096) throw new Error();
          const device = this.store.verifyTicket(JSON.parse(event.data).ticket, null);
          clearTimeout(timer);
          this.events.set(server, device.id);
          server.send(JSON.stringify({ type: "refresh" }));
        } catch {
          server.close(4401, "连接票据无效");
        }
      });
      server.addEventListener("close", () => {
        clearTimeout(timer);
        remove();
      });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private disconnect(documentId: string, deviceId?: string) {
    for (const connection of this.hocuspocus?.documents.get(documentId)?.getConnections() ?? [])
      if (!deviceId || connection.context.deviceId === deviceId)
        connection.close({ code: 4403, reason: "访问权限已撤销" });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (error) {
      const known = error instanceof CollaborationError;
      const syntax = error instanceof SyntaxError;
      return Response.json(
        {
          code: known ? error.code : syntax ? "INVALID_BODY" : "REQUEST_FAILED",
          message: known ? error.message : syntax ? "请求正文格式无效" : "协作服务暂时无法完成请求",
        },
        { status: known ? error.statusCode : syntax ? 400 : 500 }
      );
    }
  }

  private async route(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (path === "/health/ready" || path === "/health/live")
      return Response.json(
        {
          ok: this.env.MODE !== "production" || this.store.setting("ready") === "1",
          prototype: this.env.MODE !== "production",
          instance: this.env.INSTANCE_NAME ?? "isolated-prototype-v1",
          build: this.env.BUILD_REV,
          canonicalUrl: this.env.PUBLIC_URL,
          legacyOriginHashes: (this.env.LEGACY_ORIGIN_HASHES ?? "").split(",").filter(Boolean),
        },
        {
          status:
            path === "/health/ready" &&
            this.env.MODE === "production" &&
            this.store.setting("ready") !== "1"
              ? 503
              : 200,
        }
      );
    if (path.startsWith("/_admin/")) {
      this.admin(request);
      return this.adminRoute(request, path);
    }
    if (path === "/__prototype/restart" && method === "POST" && this.env.MODE !== "production") {
      this.admin(request);
      for (const socket of this.sockets) socket.close(1012, "原型运行时重启");
      if (this.hocuspocus) {
        this.hocuspocus.closeConnections();
        for (const document of [...this.hocuspocus.documents.values()])
          await this.hocuspocus.unloadDocument(document);
      }
      this.hocuspocus = undefined;
      return Response.json({ ok: true });
    }
    if (
      this.env.MODE === "production" &&
      (this.store.setting("ready") !== "1" || this.store.setting("maintenance") === "1")
    )
      return fail("MAINTENANCE", "协作服务正在维护，请稍后重试", 503);
    if (path === "/ws" || path === "/events") return this.openSocket(request, path);
    if (path === "/v1/devices" && method === "POST") {
      const body = await bodyOf(request);
      if (this.env.MODE !== "production") this.admin(request);
      return Response.json(this.store.register(field(body, "nickname", 40)));
    }
    const device = this.identity(request);
    const asset = path.match(/^\/v1\/documents\/([^/]+)\/assets(?:\/([^/]+))?$/);
    if (asset) {
      if (!this.env.ASSETS) return fail("UNAVAILABLE", "此环境未配置资源存储", 503);
      return assetRequest(
        request,
        this.store,
        this.env.ASSETS,
        asset[1],
        device.id,
        asset[2],
        this.assetOperations
      );
    }
    const body =
      request.body && (method === "POST" || method === "PATCH") ? await bodyOf(request) : {};
    if (path === "/v1/devices/me" && method === "PATCH") {
      const result = this.store.rename(device.id, field(body, "nickname", 40));
      this.refresh();
      return Response.json(result);
    }
    if (path === "/v1/devices/merge" && method === "POST") {
      const result = this.store.mergeIdentity(
        device.id,
        field(body, "sourceId", 100) + ":" + field(body, "sourceSecret", 200)
      );
      this.hocuspocus?.closeConnections();
      this.refresh();
      return Response.json(result);
    }
    if (path === "/v1/documents") {
      if (method === "GET")
        return Response.json({
          documents: this.store
            .list(device.id)
            .map(doc => ({ ...doc, members: this.members(doc.id) })),
        });
      if (method === "POST")
        return Response.json(this.store.create(device.id, field(body, "idempotencyKey", 100)));
    }
    if (path === "/v1/tickets" && method === "POST") {
      const id = body.documentId;
      if (id !== null && typeof id !== "string") return fail("INVALID_FIELD", "documentId 无效");
      if (typeof id === "string") this.store.authorize(id, device.id);
      return Response.json({
        ticket: this.store.ticket(device.id, id as string | null),
        expiresIn: 60,
      });
    }
    if (path === "/v1/join-requests") {
      if (method === "GET") return Response.json({ requests: this.store.requests(device.id) });
      if (method === "POST") {
        const result = this.store.requestJoin(field(body, "code", 32), device.id);
        this.refresh();
        return Response.json(result);
      }
    }
    const decision = path.match(/^\/v1\/join-requests\/([^/]+)\/decision$/);
    if (decision && method === "POST") {
      if (typeof body.approve !== "boolean") return fail("INVALID_FIELD", "approve 无效");
      this.store.decide(decision[1], device.id, body.approve);
      this.refresh();
      return Response.json({ ok: true });
    }
    const document = path.match(
      /^\/v1\/documents\/([^/]+)\/(publish|state|invitation|close|leave|members\/[^/]+)$/
    );
    if (!document) return fail("NOT_FOUND", "原型不支持此接口", 404);
    const [, id, action] = document;
    if (action === "publish" && method === "POST") {
      const result = this.store.publish(
        id,
        device.id,
        Buffer.from(field(body, "state", Math.ceil(MAX_DOCUMENT_BYTES * 1.4)), "base64")
      );
      this.refresh();
      return Response.json(result);
    }
    if (action === "state" && method === "GET") {
      this.store.authorize(id, device.id);
      return Response.json(this.store.snapshot(id), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "invitation" && method === "POST")
      return Response.json(this.store.rotateCode(id, device.id));
    if (action === "close" && method === "POST") {
      const members = this.store.members(id);
      const hashes = this.store.assets(id).map(row => row.hash);
      this.store.close(id, device.id);
      for (const digest of hashes)
        await this.assetOperations.run(digest, async () => {
          if (!this.store.hashReferenced(digest)) await this.env.ASSETS?.delete("assets/" + digest);
        });
      for (const member of members) this.send(member.deviceId, { type: "closed", documentId: id });
      this.disconnect(id);
      this.refresh();
      return Response.json({ ok: true });
    }
    if (
      (action === "leave" && method === "POST") ||
      (action.startsWith("members/") && method === "DELETE")
    ) {
      const target = action === "leave" ? device.id : action.slice("members/".length);
      this.store.remove(id, device.id, target);
      this.send(target, { type: "revoked", documentId: id });
      this.disconnect(id, target);
      this.refresh();
      return Response.json({ ok: true });
    }
    return fail("NOT_FOUND", "原型不支持此接口", 404);
  }

  private async adminRoute(request: Request, path: string): Promise<Response> {
    if (path === "/_admin/status") return Response.json(this.store.status());
    if (path === "/_admin/export" && request.method === "GET")
      return Response.json(this.store.exportMetadata(), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path === "/_admin/import" && request.method === "POST")
      return Response.json(this.store.beginImport(await bodyOf(request)));
    const document = path.match(/^\/_admin\/state\/([^/]+)$/);
    if (document) {
      if (request.method === "GET") return Response.json(this.store.snapshot(document[1]));
      if (request.method === "POST") {
        const body = await bodyOf(request);
        this.store.importState(
          document[1],
          Buffer.from(field(body, "state", Math.ceil(MAX_DOCUMENT_BYTES * 1.4)), "base64")
        );
        return Response.json({ ok: true });
      }
    }
    if (path === "/_admin/finish-import" && request.method === "POST") {
      for (const row of this.store.all<{ hash: string }>("SELECT DISTINCT hash FROM assets")) {
        if (!(await this.env.ASSETS?.head("assets/" + row.hash)))
          return fail("INCOMPLETE_IMPORT", "迁移资源缺失", 409);
      }
      return Response.json(this.store.finishImport());
    }
    const asset = path.match(/^\/_admin\/assets\/([a-f0-9]{64})$/);
    if (asset && request.method === "PUT") {
      if (!this.env.ASSETS || !request.body)
        return fail("INVALID_IMPORT", "缺少资源存储或资源正文");
      await this.env.ASSETS.put("assets/" + asset[1], request.body, { sha256: asset[1] });
      return Response.json({ ok: true });
    }
    if (path === "/_admin/backup" && request.method === "POST")
      return Response.json(await this.backup());
    if (path === "/_admin/maintenance" && request.method === "POST") {
      const body = await bodyOf(request);
      if (typeof body.enabled !== "boolean") return fail("INVALID_FIELD", "enabled 无效");
      this.store.setSetting("maintenance", body.enabled ? "1" : "0");
      if (body.enabled) for (const socket of this.sockets) socket.close(1012, "协作服务维护");
      return Response.json({ ok: true });
    }
    return fail("NOT_FOUND", "管理接口不存在", 404);
  }

  async backup() {
    if (!this.env.BACKUPS) return fail("UNAVAILABLE", "未配置备份存储", 503);
    const prefix =
      "backups/" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID();
    this.store.setSetting("maintenance", "1");
    for (const socket of this.sockets) socket.close(1012, "协作服务备份");
    try {
      const metadata = this.store.exportMetadata();
      await this.env.BACKUPS.put(prefix + "/metadata.json", JSON.stringify(metadata));
      const ids = this.store.all<{ id: string }>("SELECT id FROM documents WHERE status='active'");
      for (const { id } of ids) {
        const doc = this.store.load(id);
        try {
          await this.env.BACKUPS.put(prefix + "/documents/" + id, Y.encodeStateAsUpdate(doc));
        } finally {
          doc.destroy();
        }
      }
      for (const { hash } of this.store.all<{ hash: string }>("SELECT DISTINCT hash FROM assets")) {
        const asset = await this.env.ASSETS?.get("assets/" + hash);
        if (!asset) return fail("BACKUP_FAILED", "备份资源缺失", 500);
        await this.env.BACKUPS.put(prefix + "/assets/" + hash, asset.body);
      }
      const result = {
        prefix,
        createdAt: Date.now(),
        documents: ids.map(row => row.id),
        counts: this.store.status().counts,
      };
      await this.env.BACKUPS.put(prefix + "/manifest.json", JSON.stringify(result));
      return result;
    } finally {
      this.store.setSetting("maintenance", "0");
    }
  }
}

export class PrototypeCollaboration extends CollaborationService {}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (env.REQUEST_LIMITER && !path.startsWith("/_admin/")) {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (!(await env.REQUEST_LIMITER.limit({ key: ip })).success)
        return Response.json(
          { code: "RATE_LIMITED", message: "请求过于频繁，请稍后重试" },
          { status: 429 }
        );
      if (
        path === "/v1/devices" &&
        env.DEVICE_LIMITER &&
        !(await env.DEVICE_LIMITER.limit({ key: ip })).success
      )
        return Response.json(
          { code: "RATE_LIMITED", message: "设备注册过于频繁" },
          { status: 429 }
        );
    }
    return env.COLLAB.get(
      env.COLLAB.idFromName(env.INSTANCE_NAME ?? "isolated-prototype-v1")
    ).fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const stub = env.COLLAB.get(
      env.COLLAB.idFromName(env.INSTANCE_NAME ?? "isolated-prototype-v1")
    );
    ctx.waitUntil(stub.backup());
  },
};
