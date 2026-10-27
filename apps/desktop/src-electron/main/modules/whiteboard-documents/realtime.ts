import * as Y from "yjs";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";
import {
  readWhiteboardPresence,
  type DocumentProtocol,
  type WhiteboardPeer,
  type WhiteboardPresence,
} from "@tau/collaboration";
import type { CollaborationClient } from "../collaboration/client";

/** 网络副本收发本机已耐久保存的增量；HTTP 会话负责确认对账和断线补偿。 */
export class WhiteboardRealtime {
  private readonly doc = new Y.Doc();
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly provider: HocuspocusProvider;
  private closed = false;
  private pending = false;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  private peerCount = 0;
  private readonly localOrigin = {};

  constructor(
    client: CollaborationClient,
    serverUrl: string,
    private readonly protocol: DocumentProtocol,
    private readonly receive: (state: Uint8Array) => Promise<void>,
    private readonly notify: (event: { connected: boolean; peers: WhiteboardPeer[] }) => void,
    private readonly readLocal?: () => Uint8Array | undefined
  ) {
    this.socket = new HocuspocusProviderWebsocket({
      url: `${serverUrl.replace(/^http/, "ws")}/ws`,
      WebSocketPolyfill: WebSocket,
      initialDelay: 250,
      maxDelay: 10_000,
    });
    this.provider = new HocuspocusProvider({
      name: protocol.id,
      document: this.doc,
      websocketProvider: this.socket,
      token: async () =>
        (
          await client.request<{ ticket: string }>(serverUrl, "/v1/tickets", "POST", {
            documentId: protocol.id,
            protocolVersion: 3,
            epoch: protocol.epoch,
            baselineId: protocol.baselineId,
          })
        ).ticket,
      onSynced: ({ state }) => {
        if (!state || this.closed) return;
        console.info("[whiteboard-sync] 推送连接就绪", { documentId: protocol.id });
        this.publish();
        try {
          this.publishDocument();
        } catch (error) {
          console.warn("[whiteboard-sync] 重连补发失败，等待耐久对账", {
            documentId: protocol.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        this.changed();
      },
      onStatus: ({ status }) => {
        if (this.closed) return;
        console.info("[whiteboard-sync] 推送连接状态", { documentId: protocol.id, status });
        if (status !== "connected") this.notify({ connected: false, peers: [] });
      },
      onAuthenticationFailed: () => {
        console.warn("[whiteboard-sync] 推送鉴权失败", { documentId: protocol.id });
        this.notify({ connected: false, peers: [] });
      },
      onAwarenessChange: () => this.publish(),
    });
    this.doc.on("update", this.changed);
    this.provider.attach();
    void this.socket.connect().catch(() => {
      if (!this.closed) this.notify({ connected: false, peers: [] });
    });
  }

  publishDocument(): void {
    if (this.closed || !this.provider.synced) return;
    const state = this.readLocal?.();
    if (!state) return;
    const update = Y.diffUpdate(state, Y.encodeStateVector(this.doc));
    Y.applyUpdate(this.doc, update, this.localOrigin);
    console.info("[whiteboard-sync] 实时增量发送", {
      documentId: this.protocol.id,
      bytes: update.byteLength,
    });
  }

  presence(value: WhiteboardPresence | null) {
    if (this.closed) return;
    this.provider.awareness?.setLocalState({
      ...this.provider.awareness.getLocalState(),
      whiteboard: value,
      activity: value ? "viewing" : "background",
    });
  }

  private publish() {
    if (this.closed || !this.provider?.synced) return;
    const peers: WhiteboardPeer[] = [];
    for (const [clientId, state] of this.provider.awareness?.getStates() ?? []) {
      if (clientId === this.doc.clientID) continue;
      const presence = readWhiteboardPresence(state.whiteboard);
      if (presence)
        peers.push({
          ...presence,
          clientId,
          userId:
            typeof state.user?.id === "string" ? state.user.id.slice(0, 200) : String(clientId),
          name: typeof state.user?.name === "string" ? state.user.name.slice(0, 80) : "协作者",
        });
    }
    if (peers.length !== this.peerCount) {
      this.peerCount = peers.length;
      console.info("[whiteboard-sync] 在线视图数量变化", {
        documentId: this.protocol.id,
        peers: peers.length,
      });
    }
    this.notify({ connected: true, peers });
  }

  private readonly changed = (_update?: Uint8Array, origin?: unknown) => {
    if (origin === this.localOrigin) return;
    if (this.closed) return;
    this.pending = true;
    if (this.running || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.drain();
    }, 16);
  };
  private async drain() {
    if (this.closed || !this.provider.synced) return;
    this.running = true;
    this.pending = false;
    const started = performance.now();
    const state = Y.encodeStateAsUpdate(this.doc);
    try {
      await this.receive(state);
      console.info("[whiteboard-sync] 推送应用完成", {
        documentId: this.protocol.id,
        bytes: state.byteLength,
        elapsedMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      console.warn("[whiteboard-sync] 推送应用失败，等待同步补偿", {
        documentId: this.protocol.id,
        error: error instanceof Error ? error.name : "UnknownError",
        elapsedMs: Math.round(performance.now() - started),
      });
    } finally {
      this.running = false;
      if (this.pending) this.changed();
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.doc.off("update", this.changed);
    this.provider.destroy();
    this.socket.destroy();
    this.doc.destroy();
  }
}
