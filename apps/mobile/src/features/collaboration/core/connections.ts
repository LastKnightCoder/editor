import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { NODE_DOCUMENT_VERSION, type CollaborationEvent } from "@tau/collaboration";
import * as rest from "./rest";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./manager";

const EVENT_RECONNECT_MS = 5_000;

export function transport(manager: CollaborationManager, url: string) {
  let transport = manager.transports.get(url);
  if (!transport) {
    transport = new HocuspocusProviderWebsocket({
      url: `${url.replace(/^http/, "ws")}/ws`,
      initialDelay: 1000,
      maxDelay: 30000,
    });
    manager.transports.set(url, transport);
  }
  return transport;
}

export function pauseProvider(manager: CollaborationManager, session: RuntimeSession) {
  const provider = session.provider;
  if (!provider) return;
  const transport = manager.transports.get(session.info.serverUrl);
  // 连接已断开时只注销文档路由，避免关闭帧进入下一条连接。
  if (
    transport &&
    transport.status !== "connected" &&
    transport.configuration.providerMap.get(provider.effectiveName) === provider
  )
    transport.configuration.providerMap.delete(provider.effectiveName);
  provider.detach();
  provider.synced = false;
}

export function attach(manager: CollaborationManager, session: RuntimeSession, closing = false) {
  const { id, serverUrl } = session.info;
  if (
    session.assetsPending ||
    session.info.frozen ||
    (session.info.leaving && !closing) ||
    session.info.status !== "active" ||
    session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
  )
    return;
  if (!session.provider) {
    session.provider = new HocuspocusProvider({
      name: id,
      document: session.doc,
      awareness: session.awareness,
      websocketProvider: manager.transport(serverUrl),
      token: async () =>
        (
          await rest.fetchTicket(serverUrl, id, {
            protocolVersion: NODE_DOCUMENT_VERSION,
            baselineId: String(session.doc.getMap("meta").get("baselineId")),
            epoch: Number(session.doc.getMap("meta").get("epoch")),
          })
        ).ticket,
      onStatus: ({ status }) => {
        session.info.connection =
          status === "connected" ? "connected" : status === "connecting" ? "connecting" : "offline";
        manager.changed();
      },
      onSynced: ({ state }) => {
        if (!state) return;
        session.info.connection = "connected";
        session.info.error = undefined;
        if (!session.provider?.hasUnsyncedChanges && !session.assetsPending)
          session.info.pending = false;
        session.resourcesDirty = true;
        manager.changed();
      },
      onUnsyncedChanges: ({ number }) => {
        if (session.info.status !== "active" || session.info.leaving) return;
        session.info.pending = number > 0 || Boolean(session.assetsPending);
        manager.changed();
      },
      onAuthenticationFailed: () => {
        session.info.connection = "error";
        session.info.error = "协作身份验证失败或访问权限已变更";
        manager.changed();
        void manager.refresh();
      },
    });
    // 服务端会以设备身份覆写 user 与 activity，本地先写入可获得即时正确光标
    session.awareness.setLocalStateField("user", { id: manager.deviceId, name: manager.nickname });
    session.awareness.setLocalStateField("activity", "background");
  }
  session.provider.attach();
  void manager
    .transport(serverUrl)
    .connect()
    .catch(() => {
      session.info.connection = "offline";
      manager.changed();
    });
}

export async function connectEvents(manager: CollaborationManager, url: string) {
  if (manager.eventSockets.has(url) || manager.stopped) return;
  const { ticket } = await rest.fetchTicket(url, null);
  if (manager.eventSockets.has(url) || manager.stopped) return;
  const socket = new WebSocket(`${url.replace(/^http/, "ws")}/events`);
  manager.eventSockets.set(url, socket);
  socket.onopen = () => socket.send(JSON.stringify({ ticket }));
  socket.onmessage = event => {
    let payload: CollaborationEvent;
    try {
      payload = JSON.parse(String(event.data)) as CollaborationEvent;
    } catch {
      return; // 无法解析的消息忽略，下次刷新取权威状态
    }
    if (payload.type === "refresh") {
      void manager.refresh();
      return;
    }
    if (payload.type === "presence") {
      const session = manager.sessions.get(payload.documentId);
      const room = manager.rooms.get(payload.documentId);
      if (room) room.members = payload.members;
      if (session) session.info.members = payload.members;
      if (room || session) manager.changed();
      return;
    }
    const session = manager.sessions.get(payload.documentId);
    const removed = manager.rooms.delete(payload.documentId);
    if (session) manager.revokeSession(session, payload.type);
    else if (removed) manager.changed();
  };
  socket.onclose = () => {
    manager.eventSockets.delete(url);
    manager.scheduleEventsReconnect(url);
  };
}

/** /events 连接失败或断开后的兜底重连：不等 60s 轮询，尽快恢复事件推送。
 *  只重连当前配置的服务器——切换服务器时 teardown 关闭旧连接触发的
 *  onclose 不得把已废弃的旧服务器拉回重连循环。 */
export function scheduleEventsReconnect(manager: CollaborationManager, url: string) {
  if (manager.stopped || url !== manager.serverUrl || manager.eventSockets.has(url)) return;
  setTimeout(() => {
    if (manager.stopped || url !== manager.serverUrl || manager.eventSockets.has(url)) return;
    void manager.connectEvents(url).catch(() => manager.scheduleEventsReconnect(url));
  }, EVENT_RECONNECT_MS);
}
