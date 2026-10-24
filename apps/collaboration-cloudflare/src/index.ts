import { DurableObject } from "cloudflare:workers";
import { createHash, timingSafeEqual } from "node:crypto";
import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { CollaborationError, type CollaborationEvent, type Member } from "@tau/collaboration";
import { MAX_DOCUMENT_BYTES, PrototypeStore, fail } from "./store";

interface Env {
  COLLAB: DurableObjectNamespace<PrototypeCollaboration>;
  PROTOTYPE_KEY: string;
  BUILD_REV: string;
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

export class PrototypeCollaboration extends DurableObject<Env> {
  private readonly store: PrototypeStore;
  private hocuspocus?: Hocuspocus<{ deviceId: string; nickname: string }>;
  private readonly sockets = new Set<WebSocket>();
  private readonly events = new Map<WebSocket, string>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new PrototypeStore(ctx.storage);
  }

  private admin(request: Request) {
    const expected = this.env.PROTOTYPE_KEY;
    const actual = request.headers.get("x-prototype-key");
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
          return fail("CAPACITY", "原型最多同时打开 4 份文档", 429);
        return { deviceId: device.id, nickname: device.nickname };
      },
      onLoadDocument: async ({ documentName, document }) => {
        const loaded = this.store.load(documentName);
        try {
          Y.applyUpdate(document, Y.encodeStateAsUpdate(loaded));
        } finally {
          loaded.destroy();
        }
        return document;
      },
      beforeHandleMessage: async ({ documentName, context, update }) => {
        this.store.authorize(documentName, context.deviceId);
        if (update.byteLength > MAX_DOCUMENT_BYTES + 65_536) throw new Error("协作消息超过限制");
      },
      beforeSync: async ({ type, payload, context, documentName, document }) => {
        if (type === 1 || type === 2)
          this.store.append(documentName, context.deviceId, payload, document);
      },
      beforeHandleAwareness: async ({ context, documentName, states }) => {
        if (!context) throw new Error("连接状态异常");
        this.store.authorize(documentName, context.deviceId);
        if (states.size > 16 || JSON.stringify([...states]).length > 16_384)
          throw new Error("在线状态超过限制");
        for (const state of states.values()) {
          state.user = { id: context.deviceId, name: context.nickname };
          if (!["editing", "viewing", "background"].includes(state.activity))
            state.activity = "background";
        }
      },
      onStoreDocument: async ({ documentName }) => {
        this.store.compact(documentName);
      },
      connected: async ({ documentName }) => {
        this.presence(documentName);
      },
      onAwarenessUpdate: async ({ documentName }) => {
        this.presence(documentName);
      },
      onDisconnect: async ({ documentName }) => {
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
    if (this.sockets.size >= 24) return fail("CAPACITY", "原型连接数量已满", 429);
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
          message: known ? error.message : syntax ? "请求正文格式无效" : "原型服务暂时无法完成请求",
        },
        { status: known ? error.statusCode : syntax ? 400 : 500 }
      );
    }
  }

  private async route(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (path === "/health/ready" || path === "/health/live")
      return Response.json({ ok: true, prototype: true, build: this.env.BUILD_REV });
    if (path === "/__prototype/restart" && method === "POST") {
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
    if (path === "/ws" || path === "/events") return this.openSocket(request, path);
    if (path === "/v1/devices" && method === "POST") {
      const body = await bodyOf(request);
      this.admin(request);
      return Response.json(this.store.register(field(body, "nickname", 40)));
    }
    const device = this.identity(request);
    const body =
      request.body && (method === "POST" || method === "PATCH") ? await bodyOf(request) : {};
    if (path === "/v1/devices/me" && method === "PATCH") {
      const result = this.store.rename(device.id, field(body, "nickname", 40));
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
      this.store.close(id, device.id);
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
}

export default {
  fetch(request: Request, env: Env) {
    return env.COLLAB.get(env.COLLAB.idFromName("isolated-prototype-v1")).fetch(request);
  },
};
