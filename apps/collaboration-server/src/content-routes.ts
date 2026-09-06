import type { FastifyInstance, FastifyRequest } from "fastify";
import * as Y from "yjs";
import { CollaborationError, type CollaborationEvent, type Member } from "@tau/collaboration";
import type { CollaborationStore } from "./store";
import type { ServerConfig } from "./config";
const objectBody = (request: FastifyRequest) => {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body))
    throw new CollaborationError("INVALID_BODY", "请求内容必须是对象");
  return request.body as Record<string, unknown>;
};
const textField = (body: Record<string, unknown>, key: string, max = 200) => {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new CollaborationError("INVALID_FIELD", `${key} 格式不正确`);
  return value.trim();
};
const params = (request: FastifyRequest) => request.params as Record<string, string>;
interface RouteContext {
  store: CollaborationStore;
  config: ServerConfig;
  device: (request: FastifyRequest) => ReturnType<CollaborationStore["authenticate"]>;
  refresh: () => void;
  send: (id: string, event: CollaborationEvent) => void;
  disconnect: (id: string, memberId?: string) => void;
  members: (id: string) => Member[];
}
export function registerContentRoutes(
  app: FastifyInstance,
  { store, config, device, refresh, send, disconnect, members }: RouteContext
) {
  app.post(
    "/v1/devices",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async request => store.register(textField(objectBody(request), "nickname", 40))
  );
  app.patch("/v1/devices/me", async request => {
    const identity = device(request);
    const nickname = textField(objectBody(request), "nickname", 40);
    store.db.prepare("UPDATE devices SET nickname=? WHERE id=?").run(nickname, identity.id);
    refresh();
    return { nickname };
  });
  app.get("/v1/documents", async request => ({
    documents: store.list(device(request).id).map(item => ({ ...item, members: members(item.id) })),
  }));
  app.post(
    "/v1/documents",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async request => {
      const row = store.create(
        device(request).id,
        textField(objectBody(request), "idempotencyKey", 100)
      );
      return { id: row.id, status: row.status };
    }
  );
  app.post("/v1/documents/:id/publish", async request => {
    const state = textField(objectBody(request), "state", Math.ceil(config.maxDocumentBytes * 1.4));
    const result = store.publish(
      params(request).id,
      device(request).id,
      Buffer.from(state, "base64")
    );
    refresh();
    return result;
  });
  app.post("/v1/documents/:id/invitation", async request =>
    store.rotateCode(params(request).id, device(request).id)
  );
  app.get("/v1/documents/:id/state", async (request, reply) => {
    const id = params(request).id;
    store.authorize(id, device(request).id);
    const doc = store.loadDocument(id);
    try {
      return reply.header("Cache-Control", "no-store").send({
        state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
      });
    } finally {
      doc.destroy();
    }
  });
  app.post(
    "/v1/join-requests",
    { config: { rateLimit: { max: 15, timeWindow: "10 minutes" } } },
    async request => {
      const result = store.requestJoin(
        textField(objectBody(request), "code", 32),
        device(request).id
      );
      refresh();
      return result;
    }
  );
  app.get("/v1/join-requests", async request => ({
    requests: store.requests(device(request).id),
  }));
  app.post("/v1/join-requests/:id/decision", async request => {
    const approve = objectBody(request).approve;
    if (typeof approve !== "boolean")
      throw new CollaborationError("INVALID_FIELD", "approve 必须是布尔值");
    store.decide(params(request).id, device(request).id, approve);
    refresh();
    return { ok: true };
  });
  app.post("/v1/documents/:id/leave", async request => {
    const identity = device(request);
    const id = params(request).id;
    try {
      store.removeMember(id, identity.id, identity.id);
    } catch (error) {
      if (!(error instanceof CollaborationError && [403, 410].includes(error.statusCode)))
        throw error;
    }
    disconnect(id, identity.id);
    refresh();
    return { ok: true };
  });
  app.delete("/v1/documents/:id/members/:memberId", async request => {
    const { id, memberId } = params(request);
    store.removeMember(id, device(request).id, memberId);
    send(memberId, { type: "revoked", documentId: id });
    disconnect(id, memberId);
    refresh();
    return { ok: true };
  });
  app.post("/v1/documents/:id/close", async request => {
    const id = params(request).id;
    const identity = device(request);
    store.closeDocument(id, identity.id);
    for (const member of store.members(id))
      send(member.deviceId, { type: "closed", documentId: id });
    disconnect(id);
    refresh();
    return { ok: true };
  });
  app.post("/v1/tickets", async request => {
    const identity = device(request);
    const body = objectBody(request);
    const documentId = body.documentId;
    if (documentId !== null && typeof documentId !== "string")
      throw new CollaborationError("INVALID_FIELD", "documentId 格式不正确");
    if (documentId) store.authorize(documentId, identity.id);
    return { ticket: store.ticket(identity.id, documentId), expiresIn: 60 };
  });
}
