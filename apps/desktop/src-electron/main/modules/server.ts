import { Module } from "../types/module";
import Express, { NextFunction, Request, Response } from "express";
import PathUtil from "../utils/PathUtil";
import http from "http";
import { app as electronApp } from "electron";
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
import { RPC_EVENTS_WS_PATH } from "@tau/rpc";
import { getRpcToken, registerCommandRoutes, RPC_SERVER_PORT } from "../rpc/command-server";

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

const PORT = RPC_SERVER_PORT;

class ServerModule implements Module {
  name: string;
  app: Express.Application;
  server: http.Server;
  wsServers: Record<string, WebSocketServer> = {};
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

      const applyCorsHeaders = (res: Response) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
        res.setHeader(
          "Access-Control-Expose-Headers",
          "Content-Length, Content-Range, Accept-Ranges"
        );
      };

      // 处理跨域预检请求（WaveSurfer 可能携带 Range 头触发 OPTIONS）
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        applyCorsHeaders(res);
        if (req.method === "OPTIONS") {
          res.status(204).end();
          return;
        }
        next();
      });
      // HTTP RPC 端点（/rpc/invoke、/rpc/send，body 解析作用域化在路由内），
      // 必须挂在静态服务与 404 兜底之前（Express 按注册顺序匹配）
      registerCommandRoutes(this.app);
      this.app.use(
        Express.static(appDir, {
          setHeaders: res => applyCorsHeaders(res),
        })
      );
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
          return;
        }

        const url = new URL(request.url, `http://${request.headers.host}`);

        // /rpc-events 承载全部主进程事件推送（含文档内容等敏感数据），
        // 打包版要求与 HTTP RPC 同源的 token（WS 无法携带自定义头，经查询参数传递）。
        // 历史通道 /backendServer、/aiServer 是扩展与 CLI 的固定发现入口，暂不设限
        if (
          url.pathname === RPC_EVENTS_WS_PATH &&
          electronApp.isPackaged &&
          url.searchParams.get("token") !== getRpcToken()
        ) {
          console.error("[ws upgrade] unauthorized rpc-events connection");
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

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
      // 固定端口为跨应用契约（browser-extension、cli 硬编码 24678 发现本应用，
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
      this.server.listen(PORT, () => {
        resolve();
      });
    });
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
