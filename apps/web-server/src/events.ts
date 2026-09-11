import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { RPC_EVENTS_WS_PATH, serialize, type EventMessage } from "@tau/rpc";

/** 与渲染端 event-hub 约定的推送帧格式（对齐桌面版 WS hub 的 Notification 帧） */
const EVENT_FRAME = {
  type: "JsonRpcNotification",
  method: "rpc-event",
} as const;

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * /rpc-events 广播通道：Web Server 版的事件推送 hub。
 *
 * 桌面版经 webContents.send 拦截进入同构 hub；Web 版命令实现直接调用
 * broadcast 推送。多用户定向路由（connectionId/sessionId）留待登录态接入。
 */
export class RpcEventsHub {
  private wss = new WebSocketServer({ noServer: true });
  private clients = new Set<WebSocket>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, ws => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("message", data => {
        // 客户端仅回心跳，其余入站消息无业务语义
        if (String(data) === "ping") {
          ws.send("pong");
        }
      });
    });
  }

  /** 广播事件：args 先经严格序列化，与 /rpc/invoke 的载荷规则一致 */
  broadcast(channel: string, args: unknown[], windowId = 0): void {
    if (!this.clients.size) {
      return;
    }
    const message: EventMessage = {
      channel,
      args: args.map(arg => serialize(arg)),
      windowId,
    };
    const frame = JSON.stringify({ ...EVENT_FRAME, data: message });
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(frame);
      }
    }
  }

  /** 浏览器 WS 会自动响应协议层 ping，用于探活清理死连接 */
  startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === client.OPEN) {
          client.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  async close(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
    for (const client of this.clients) {
      client.terminate();
    }
    this.clients.clear();
    await new Promise<void>(resolve => this.wss.close(() => resolve()));
  }
}

export { RPC_EVENTS_WS_PATH };
