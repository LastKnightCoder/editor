import http from "node:http";
import Express from "express";
import type { Application, Request } from "express";
import {
  RPC_EVENTS_WS_PATH,
  registerCommandRoutes,
  type CommandEvent,
  type CommandRegistry,
  type InvokeRequest,
} from "@tau/rpc";
import { commandRegistry as commandBridgeRegistry } from "./command-bridge";
import { RpcEventsHub } from "./events";
import type { WebServerConfig } from "./config";

export interface WebServer {
  app: Application;
  server: http.Server;
  registry: CommandRegistry;
  events: RpcEventsHub;
  listen(): Promise<void>;
  close(): Promise<void>;
}

/**
 * 组装 Web Server：中立协议端点 + 事件广播 hub。
 *
 * handler 的事件上下文由合成 sender 提供：send 即广播（Web 版没有
 * "定向到某个窗口"的概念，多用户定向路由待登录态接入后基于 sessionId 细化）。
 */
export function createServer(config: WebServerConfig): WebServer {
  // 契约命令（command-bridge 装配侧写入）与本 server 共享同一 registry 实例
  const registry = commandBridgeRegistry;
  const events = new RpcEventsHub();

  const resolveEvent = (request: InvokeRequest): CommandEvent => {
    const sender = {
      id: request.windowId ?? 0,
      send: (channel: string, ...args: unknown[]) => events.broadcast(channel, args),
      isDestroyed: () => false,
    };
    return { sender, senderFrame: null, windowId: request.windowId, sessionId: request.sessionId };
  };

  const isAuthorized = (req: Request): boolean => {
    // AUTH_TOKEN 未设置 = 开发模式跳过校验（与桌面版 dev 语义对齐）
    if (config.authToken === null) {
      return true;
    }
    return req.headers.authorization === `Bearer ${config.authToken}`;
  };

  const app = Express();
  registerCommandRoutes(app, {
    registry,
    resolveEvent,
    isAuthorized,
    bodyParser: Express.json({ limit: "256mb" }),
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), wsClients: events.clientCount });
  });

  const server = http.createServer(app);
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== RPC_EVENTS_WS_PATH) {
      socket.destroy();
      return;
    }
    if (config.authToken !== null && url.searchParams.get("token") !== config.authToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    events.handleUpgrade(req, socket, head);
  });

  return {
    app,
    server,
    registry,
    events,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, () => {
          server.off("error", reject);
          resolve();
        });
      }),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
      await events.close();
    },
  };
}
