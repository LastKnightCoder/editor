import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";
import { NODE_DOCUMENT_VERSION } from "@tau/collaboration";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./index";

export function transport(manager: CollaborationManager, url: string) {
  let transport = manager.transports.get(url);
  if (!transport) {
    transport = new HocuspocusProviderWebsocket({
      url: `${url.replace(/^http/, "ws")}/ws`,
      WebSocketPolyfill: WebSocket,
      initialDelay: 1000,
      maxDelay: 30000,
    });
    manager.transports.set(url, transport);
  }
  return transport;
}

export function attach(manager: CollaborationManager, session: RuntimeSession) {
  if (
    session.info.mode === "local" ||
    session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION ||
    session.info.frozen ||
    session.provider ||
    session.info.leaving ||
    session.info.status !== "active"
  )
    return;
  const { id, serverUrl } = session.info;
  const transport = manager.transport(serverUrl);
  session.provider = new HocuspocusProvider({
    name: id,
    document: session.doc,
    awareness: session.awareness,
    websocketProvider: transport,
    token: async () =>
      (
        await manager.client.request<{ ticket: string }>(serverUrl, "/v1/tickets", "POST", {
          documentId: id,
          ...(session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION
            ? {
                protocolVersion: NODE_DOCUMENT_VERSION,
                epoch: session.doc.getMap("meta").get("epoch"),
                baselineId: session.doc.getMap("meta").get("baselineId"),
              }
            : {}),
        })
      ).ticket,
    onStatus: ({ status }) => {
      session.info.connection =
        status === "connected" ? "connected" : status === "connecting" ? "connecting" : "offline";
      manager.content.changed(session);
    },
    onSynced: ({ state }) => {
      if (!state) return;
      session.info.connection = "connected";
      session.info.error = undefined;
      if (!session.provider?.hasUnsyncedChanges && !manager.assets.hasPending(id))
        session.info.pending = false;
      manager.content.changed(session);
    },
    onUnsyncedChanges: ({ number }) => {
      if (session.info.status === "active" && !session.info.leaving)
        session.info.pending = number > 0 || manager.assets.hasPending(id);
      manager.content.changed(session);
    },
    onAuthenticationFailed: () => {
      session.info.connection = "error";
      session.info.error = "协作身份验证失败或访问权限已变更";
      manager.content.changed(session);
      void manager.refresh();
    },
  });
  session.provider.awareness?.setLocalStateField("activity", "background");
  if (!manager.assets.hasPending(id)) session.provider.attach();
  void transport.connect().catch(() => {
    session.info.connection = "offline";
    manager.content.changed(session);
  });
}
