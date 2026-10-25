import { Module } from "../types/module";
import Express, { NextFunction, Request, Response } from "express";
import PathUtil from "../utils/PathUtil";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { RpcResponseMessage, RpcNotificationMessage, RpcMessageType } from "@/types";
import {
  isPingMessage,
  isPongMessage,
  isRpcRequestMessage,
  isRpcResponseMessage,
  isRpcNotificationMessage,
} from "@/utils/rpc";
import {
  isAllowedWsOrigin,
  isServableStaticPath,
  resolveCorsOrigin,
  resolveDevServerOrigin,
} from "./server-access";

interface WsServer extends WebSocketServer {
  server: {
    clientID: string;
    ws: WebSocket;
    messageId2client: Record<string, string>;
  } | null;
  clientsDict: {
    [key: string]: {
      ws: WebSocket;
      messageWhitelist: Set<string> | null;
    };
  };
}

// 固定端口为跨应用契约（浏览器伴读扩展硬编码 24678 发现本应用，
// convertFileSrc 产出的资产 URL 会持久化进用户文档），不可动态分配
export const RPC_SERVER_PORT = 24678;

/** 独立处理握手的 WS 路径（自带来源与身份校验，不进通用转发） */
export type UpgradeRoute = (
  request: http.IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer
) => void;

const PORT = RPC_SERVER_PORT;
// 只对本机开放：静态目录与 WS 中转都不应暴露给局域网
const HOST = "127.0.0.1";

class ServerModule implements Module {
  name: string;
  app: Express.Application;
  server: http.Server;
  wsServers: Record<string, WebSocketServer> = {};
  private readonly upgradeRoutes = new Map<string, UpgradeRoute>();
  private initialized = false;
  constructor() {
    this.name = "static-server";
    this.app = Express();
    this.server = http.createServer(this.app);
  }

  async init() {
    if (this.initialized) {
      console.log("ServerModule already initialized, skipping");
      return;
    }
    this.initialized = true;

    return new Promise<void>((resolve, reject) => {
      const appDir = PathUtil.getAppDir();
      const devServerOrigin = resolveDevServerOrigin(process.env.VITE_DEV_SERVER_URL);

      // 只对插件与开发期渲染端回显 CORS；打包渲染端（file://）的请求不带 Origin，无需 CORS
      const applyCorsHeaders = (req: Request, res: Response) => {
        res.setHeader("Vary", "Origin");
        const allowOrigin = resolveCorsOrigin(req.headers.origin, devServerOrigin);
        if (!allowOrigin) return;
        res.setHeader("Access-Control-Allow-Origin", allowOrigin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
        res.setHeader(
          "Access-Control-Expose-Headers",
          "Content-Length, Content-Range, Accept-Ranges"
        );
      };

      // 处理跨域预检请求（WaveSurfer 可能携带 Range 头触发 OPTIONS）
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        applyCorsHeaders(req, res);
        if (req.method === "OPTIONS") {
          res.status(204).end();
          return;
        }
        // 应用目录里有库文件、设置（含模型密钥）、会话与凭据，只放行资源类文件
        if (!isServableStaticPath(req.path)) {
          res.status(404);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
          return;
        }
        next();
      });
      this.app.use(Express.static(appDir));
      this.app.use(
        (
          err: { status?: number; statusCode?: number; message?: string } | undefined,
          _req: Request,
          res: Response,
          next: NextFunction
        ) => {
          if (!err) {
            return next();
          }
          if (res.headersSent) {
            return next(err);
          }
          const status =
            typeof err?.status === "number"
              ? err.status
              : typeof err?.statusCode === "number"
                ? err.statusCode
                : 500;
          const message = status === 404 ? "Not Found" : err?.message || "Internal Server Error";
          console.error(`[static-server] request failed with status ${status}:`, err);
          res.status(status);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(message);
          return;
        }
      );
      this.app.use((_req: Request, res: Response) => {
        if (res.headersSent) {
          return;
        }
        res.status(404);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not Found");
      });

      this.server.on("upgrade", (request, socket, head) => {
        console.log("upgrade", request.url);
        if (!request.url) {
          console.error("[ws upgrade] url is not exist");
          socket.destroy();
          return;
        }
        const route = this.upgradeRoutes.get(new URL(request.url, "http://127.0.0.1").pathname);
        if (route) {
          route(request, socket, head);
          return;
        }
        // 浏览器里的任意网页都能连 ws://localhost，靠浏览器不可伪造的 Origin 拒绝
        if (!isAllowedWsOrigin(request.headers.origin, devServerOrigin)) {
          console.warn(`[ws upgrade] 拒绝来源 ${request.headers.origin} 的连接: ${request.url}`);
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
          return;
        }

        const url = new URL(request.url, `http://${request.headers.host}`);

        const isServer = url.searchParams.get("isServer") === "true";
        let path = url.pathname.replace(/([^/])\/+$/, "$1");
        if (/^\/+$/.test(path)) {
          path = "/";
        }

        let wss = this.wsServers[path];
        if (!wss) {
          console.log(`创建新的 WebSocket 服务器实例，路径为：${path}`);
          wss = this.createWSServer(path); // 动态创建 WebSocket.Server 实例
          this.wsServers[path] = wss; // 将实例存储在 wsServers 对象中
        }

        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit("connection", ws, request, { isServer });
        });
      });
      // 固定端口为跨应用契约（browser-extension 硬编码 24678 发现本应用，
      // convertFileSrc 产出的资产 URL 会持久化进用户文档），不可动态分配；
      // 占用失败时给出可定位的诊断，init 失败由 ModuleInitManager 记录为模块 ERROR
      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          console.error(
            `[static-server] 端口 ${PORT} 已被占用，请检查是否有本应用的其他实例或其他程序（如 vite dev server）占用了该端口`
          );
        } else {
          console.error("[static-server] server error:", error);
        }
        reject(error);
      });
      this.server.listen(PORT, HOST, () => {
        resolve();
      });
    });
  }

  /** 登记独立握手路径；路由自行校验来源与身份 */
  registerUpgradeRoute(path: string, route: UpgradeRoute): void {
    this.upgradeRoutes.set(path, route);
  }

  createWSServer(path: string) {
    const wss = new WebSocketServer({
      noServer: true,
    }) as WsServer;
    wss.clientsDict = {};

    wss.on("upgrade", (request, socket, head) => {
      socket.setNoDelay(true);
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit("connection", ws, request);
      });
    });

    wss.on("connection", (ws: WebSocket, request: Request) => {
      const clientID = uuidv4();
      const url = new URL(`ws://localhost${request.url}`);
      const isServerParam = url.searchParams.get("isServer");
      const isServer = isServerParam === "true";
      const messageWhitelist: Set<string> | null = null;

      if (isServer) {
        if (wss.server != null) {
          // 多个Server暂时不支持
          console.warn(`${path} has server, ignore this server`);
          ws.close();
        } else {
          wss.server = {
            clientID,
            ws,
            messageId2client: {},
          };
          console.log(`add server ${clientID} for ${path}`);

          const notification: RpcNotificationMessage<null> = {
            type: RpcMessageType.Notification,
            method: "server-ready",
            data: null,
          };
          const message = JSON.stringify(notification);
          Object.values(wss.clientsDict).forEach(wsClient => {
            wsClient.ws.send(message, {
              binary: false,
            });
          });
        }
      } else {
        console.log(`add client: ${clientID} for ${path}`);
        wss.clientsDict[clientID] = {
          ws: ws,
          messageWhitelist: messageWhitelist,
        };
        // 如果服务器已经存在，向新加入的客户端发送 ServerReady 通知
        if (wss.server) {
          const notification: RpcNotificationMessage<null> = {
            type: RpcMessageType.Notification,
            method: "server-ready",
            data: null,
          };
          const message = JSON.stringify(notification);
          ws.send(message, {
            binary: false,
          });
          console.log(`Sent ServerReady notification to new client ${clientID} for ${path}`);
        }
      }

      ws.on("message", (message: string) => {
        try {
          const msg = JSON.parse(message);

          if (msg.send_timestamp && msg.send_timestamp < Date.now() - 1 * 1000) {
            console.warn(`message from ${clientID} ${path} is too old `, msg);
          }
          if (isPingMessage(msg)) {
            ws.send(
              JSON.stringify({
                type: RpcMessageType.Pong,
              })
            );
            return;
          } else if (isPongMessage(msg)) {
            ws.send(
              JSON.stringify({
                type: RpcMessageType.Ping,
              })
            );
            return;
          }

          if (isRpcRequestMessage(msg)) {
            if (wss.server) {
              wss.server.messageId2client[msg.id] = clientID;

              wss.server.ws.send(message, {
                binary: false,
              });
            } else {
              const errorResponse: RpcResponseMessage<null, null> = {
                type: RpcMessageType.Response,
                id: msg.id,
                error: {
                  code: -1,
                  message: "no server",
                  data: null,
                },
                result: null,
                method: msg.method,
              };
              ws.send(JSON.stringify(errorResponse));
            }
          } else if (isRpcResponseMessage(msg)) {
            if (!wss.server) {
              console.error("server is not exist");
              return;
            }

            const toClientID = wss.server.messageId2client[msg.id];
            const client = wss.clientsDict[toClientID];
            if (!client) {
              console.log("client is gone");
              return;
            }

            client.ws.send(message, {
              binary: false,
            });
            if (wss.server) {
              delete wss.server.messageId2client[msg.id];
            }
          } else if (isRpcNotificationMessage(msg)) {
            Object.values(wss.clientsDict).forEach(wsClient => {
              wsClient.ws.send(message, {
                binary: false,
              });
            });
          } else {
            throw new Error("unknown message type");
          }
        } catch (error) {
          console.error("消息处理失败，关闭连接:", error, `${message}`);
          ws.close();
        }
      });

      ws.on("error", err => {
        console.error(`clientID: ${clientID} ${path} error:`, err);
        ws.close();
      });

      ws.on("close", (code, reason) => {
        console.log(`clientID: ${clientID} close, ${path}, code: ${code}, reason: ${reason}`);
        if (isServer) {
          const notification: RpcNotificationMessage<null> = {
            type: RpcMessageType.Notification,
            method: "server-gone",
            data: null,
          };
          const message = JSON.stringify(notification);

          Object.values(wss.clientsDict).forEach(wsClient => {
            wsClient.ws.send(message, {
              binary: false,
            });
          });

          wss.server = null;
        } else {
          delete wss.clientsDict[clientID];
        }
      });
    });

    return wss;
  }
}

export default new ServerModule();
