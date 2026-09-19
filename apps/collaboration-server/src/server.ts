import Fastify, { type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { Hocuspocus, type WebSocketLike } from "@hocuspocus/server";
import { WebSocket } from "ws";
import {
  CollaborationError,
  COLLABORATION_VERSION,
  type CollaborationEvent,
  type Member,
} from "@tau/collaboration";
import { loadConfig, type ServerConfig } from "./config";
import { CollaborationStore } from "./store";
import { registerAssetRoutes } from "./asset-routes";
import { registerContentRoutes } from "./content-routes";
import { PresenceScheduler } from "./presence-scheduler";

// WebSocket 消息里 Yjs 二进制经 base64/协议帧包装后的额外开销上限
const WS_OVERHEAD_BYTES = 65536;
// 固定窗口限流：key 为连接 socketId，超窗重置
const windowLimiter = (limit: number, windowMs: number, message: string) => {
  const counts = new Map<string, { startedAt: number; count: number }>();
  return {
    check(key: string) {
      const now = Date.now();
      const current = counts.get(key);
      const rate =
        current && now - current.startedAt < windowMs ? current : { startedAt: now, count: 0 };
      rate.count += 1;
      counts.set(key, rate);
      if (rate.count > limit) throw new Error(message);
    },
    release(key: string) {
      counts.delete(key);
    },
  };
};

export async function createServer(overrides: Partial<ServerConfig> = {}) {
  const config = loadConfig(overrides);
  const store = new CollaborationStore(config);
  const app = Fastify({
    logger: config.logger
      ? {
          redact: ["req.headers.authorization", "req.body", "res.headers.set-cookie"],
        }
      : false,
    disableRequestLogging: true,
    bodyLimit: Math.ceil(config.maxDocumentBytes * 1.4) + 2048,
    trustProxy: config.trustProxy,
  });
  await app.register(rateLimit, { max: config.globalRateLimit, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: config.maxAssetBytes, files: 1, fields: 2, parts: 3 },
  });
  await app.register(websocket, {
    options: { maxPayload: config.maxDocumentBytes + WS_OVERHEAD_BYTES },
  });
  const eventClients = new Map<string, Set<WebSocket>>();
  const sockets = new Set<WebSocket>();
  const messageRates = windowLimiter(3000, 60000, "编辑请求过于频繁");
  const awarenessRates = windowLimiter(600, 60000, "在线状态更新过于频繁");
  let stopping = false;

  const send = (deviceId: string, event: CollaborationEvent) => {
    for (const socket of eventClients.get(deviceId) || [])
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };
  const refresh = () => {
    for (const id of eventClients.keys()) send(id, { type: "refresh" });
  };
  const device = (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer "))
      throw new CollaborationError("UNAUTHORIZED", "请先配置协作身份", 401);
    return store.authenticate(header.slice(7));
  };

  const onlineActivities = (documentId: string): Map<string, Member["activity"]> => {
    const document = hocuspocus.documents.get(documentId);
    const online = new Map<string, Member["activity"]>();
    for (const connection of document?.getConnections() || [])
      online.set(connection.context.deviceId, "background");
    for (const state of document?.awareness.getStates().values() || []) {
      const id = state.user?.id;
      if (typeof id !== "string" || !online.has(id)) continue;
      const activity = state.activity;
      if (activity === "editing" || (activity === "viewing" && online.get(id) !== "editing"))
        online.set(id, activity);
    }
    return online;
  };
  /** 把持久化成员行合并实时在线态；文档列表与 presence 共用。 */
  const mergeOnline = (
    documentId: string,
    base: Omit<Member, "online" | "activity">[]
  ): Member[] => {
    const online = onlineActivities(documentId);
    return base.map(member => ({
      ...member,
      online: online.has(member.deviceId),
      activity: online.get(member.deviceId) || "background",
    }));
  };
  const members = (documentId: string): Member[] =>
    mergeOnline(documentId, store.members(documentId));
  const publishPresence = (documentId: string) => {
    const values = members(documentId);
    for (const member of values)
      send(member.deviceId, { type: "presence", documentId, members: values });
  };
  const disconnect = (documentId: string, deviceId?: string) => {
    for (const connection of hocuspocus.documents.get(documentId)?.getConnections() || []) {
      if (!deviceId || connection.context.deviceId === deviceId)
        connection.close({ code: 4403, reason: "访问权限已撤销" });
    }
  };
  const presence = new PresenceScheduler(publishPresence);

  const hocuspocus = new Hocuspocus<{ deviceId: string; nickname: string }>({
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,
    timeout: 60000,
    async onAuthenticate({ token, documentName }) {
      const identity = store.verifyTicket(token, documentName);
      store.authorize(documentName, identity.id);
      if (
        !hocuspocus.documents.has(documentName) &&
        hocuspocus.getDocumentsCount() >= config.maxActiveDocuments
      )
        throw new CollaborationError("CAPACITY", "服务器活动文章数量已满", 429);
      return { deviceId: identity.id, nickname: identity.nickname };
    },
    async onLoadDocument({ documentName }) {
      return store.loadDocument(documentName);
    },
    async beforeHandleMessage({ documentName, context, update, socketId }) {
      store.authorize(documentName, context.deviceId);
      if (stopping || update.byteLength > config.maxDocumentBytes + WS_OVERHEAD_BYTES)
        throw new Error("服务暂停写入或消息超过限制");
      messageRates.check(socketId);
    },
    async beforeSync({ type, payload, context, documentName, document }) {
      if (type === 1 || type === 2)
        store.appendUpdate(documentName, context.deviceId, payload, document);
    },
    async beforeHandleAwareness({ context, documentName, states, connection, socketId }) {
      if (!context || !socketId) throw new Error("连接状态异常");
      store.authorize(documentName, context.deviceId);
      awarenessRates.check(socketId);
      if (states.size > 16 || JSON.stringify([...states]).length > 16384)
        throw new Error("在线状态超过限制");
      for (const state of states.values()) {
        // 成员识别色由各端 memberColor(deviceId) 本地派生（palette.ts），服务端不注入 UI 概念
        state.user = { id: context.deviceId, name: context.nickname };
        if (!["editing", "viewing", "background"].includes(state.activity))
          state.activity = "background";
        state.socketId = connection?.socketId;
      }
    },
    async onStoreDocument({ documentName }) {
      store.compact(documentName);
    },
    async connected({ documentName }) {
      publishPresence(documentName);
    },
    async onAwarenessUpdate({ documentName }) {
      presence.schedule(documentName);
    },
    async onDisconnect({ documentName, socketId }) {
      messageRates.release(socketId);
      awarenessRates.release(socketId);
      presence.schedule(documentName);
    },
    async onStateless() {
      throw new Error("不支持客户端自定义广播");
    },
  });

  app.setErrorHandler((error, request, reply) => {
    const failure = error as Error & { statusCode?: number };
    const status =
      error instanceof CollaborationError ? error.statusCode : failure.statusCode || 500;
    // disableRequestLogging 关闭了常规请求日志，5xx 必须在此留痕，否则线上无从排查。
    if (status >= 500) request.log.error({ err: error, url: request.url }, "request failed");
    reply.code(status).send({
      code: error instanceof CollaborationError ? error.code : "REQUEST_FAILED",
      message: status >= 500 ? "服务器暂时无法完成请求，请稍后重试" : failure.message,
    });
  });
  app.get("/health/live", async () => ({
    ok: true,
    version: COLLABORATION_VERSION,
  }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      store.db.prepare("SELECT 1").get();
      store.ensureCapacity(0);
      if (stopping) throw new Error();
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  registerContentRoutes(app, {
    store,
    config,
    device,
    refresh,
    send,
    disconnect,
    members,
    mergeOnline,
  });

  registerAssetRoutes(app, store, config, device);

  const trackSocket = (socket: WebSocket) => {
    if (stopping || sockets.size >= config.maxConnections) {
      socket.close(1013, "服务器连接数量已满");
      return false;
    }
    sockets.add(socket);
    socket.on("pong", () => lastPong.set(socket, Date.now()));
    socket.on("close", () => sockets.delete(socket));
    return true;
  };
  app.get("/ws", { websocket: true }, (socket, request) => {
    if (!trackSocket(socket)) return;
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers))
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    const connection = hocuspocus.handleConnection(
      socket as unknown as WebSocketLike,
      new Request(`${config.publicUrl}/ws`, { headers })
    );
    socket.on("message", data => connection.handleMessage(new Uint8Array(data as Buffer)));
    socket.on("close", (code, reason) =>
      connection.handleClose({ code, reason: reason.toString() } as CloseEvent)
    );
  });
  app.get("/events", { websocket: true }, socket => {
    if (!trackSocket(socket)) return;
    let id: string | undefined;
    const authTimeout = setTimeout(() => socket.close(4401, "连接鉴权超时"), 10000);
    socket.on("message", bytes => {
      try {
        if (bytes.toString().length > 4096) throw new Error();
        if (id) return;
        const message = JSON.parse(bytes.toString());
        const identity = store.verifyTicket(message.ticket, null);
        id = identity.id;
        clearTimeout(authTimeout);
        let clients = eventClients.get(id);
        if (!clients) {
          clients = new Set();
          eventClients.set(id, clients);
        }
        clients.add(socket);
        send(id, { type: "refresh" });
      } catch {
        socket.close(4401, "连接鉴权失败");
      }
    });
    socket.on("close", () => {
      clearTimeout(authTimeout);
      if (id) {
        eventClients.get(id)?.delete(socket);
        if (!eventClients.get(id)?.size) eventClients.delete(id);
      }
    });
  });
  // 心跳跟踪 pong：连续两个周期未响应的连接视为僵尸连接并强制断开，
  // 否则半开连接要等 TCP 超时才释放，会长期占用连接配额。
  const lastPong = new WeakMap<WebSocket, number>();
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const pongAt = lastPong.get(socket) ?? now;
      if (now - pongAt > 45000) {
        socket.terminate();
        sockets.delete(socket);
        continue;
      }
      socket.ping();
    }
  }, 20000);
  heartbeat.unref();
  app.addHook("onClose", async () => {
    stopping = true;
    presence.close();
    clearInterval(heartbeat);
    for (const socket of sockets) socket.close(1012, "服务正在更新");
    hocuspocus.closeConnections();
    await new Promise(resolve => setTimeout(resolve, 20));
    hocuspocus.flushPendingStores();
    await Promise.all(
      [...hocuspocus.documents.values()].map(document => hocuspocus.unloadDocument(document))
    );
    store.close();
  });
  return { app, store, hocuspocus, config, members };
}
