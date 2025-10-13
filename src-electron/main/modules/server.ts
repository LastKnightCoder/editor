import { Module } from "../types/module";
import Express from "express";
import PathUtil from "../utils/PathUtil";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  RpcResponseMessage,
  RpcNotificationMessage,
  RpcMessageType,
} from "@/types";
import {
  isPingMessage,
  isPongMessage,
  isRpcRequestMessage,
  isRpcResponseMessage,
  isRpcNotificationMessage,
} from "@/utils/rpc";

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

const PORT = 24678;

class ServerModule implements Module {
  name: string;
  app: Express.Application;
  server: http.Server;
  wsServers: Record<string, WebSocketServer> = {};
  constructor() {
    this.name = "static-server";
    this.app = Express();
    this.server = http.createServer(this.app);
  }

  async init() {
    return new Promise<void>((resolve) => {
      const appDir = PathUtil.getAppDir();
      this.app.use(
        Express.static(appDir, {
          setHeaders: (res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader(
              "Access-Control-Allow-Methods",
              "GET, POST, PUT, DELETE, OPTIONS",
            );
            res.setHeader(
              "Access-Control-Allow-Headers",
              "Content-Type, Authorization",
            );
          },
        }),
      );

      this.server.on("upgrade", (request, socket, head) => {
        console.log("upgrade", request.url);
        if (!request.url) {
          console.error("[ws upgrade] url is not exist");
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

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request, { isServer });
        });
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
      wss.handleUpgrade(request, socket, head, (ws) => {
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
          Object.values(wss.clientsDict).forEach((wsClient) => {
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
          console.log(
            `Sent ServerReady notification to new client ${clientID} for ${path}`,
          );
        }
      }

      ws.on("message", (message: string) => {
        try {
          const msg = JSON.parse(message);

          if (
            msg.send_timestamp &&
            msg.send_timestamp < Date.now() - 1 * 1000
          ) {
            console.warn(`message from ${clientID} ${path} is too old `, msg);
          }
          if (isPingMessage(msg)) {
            ws.send(
              JSON.stringify({
                type: RpcMessageType.Pong,
              }),
            );
            return;
          } else if (isPongMessage(msg)) {
            ws.send(
              JSON.stringify({
                type: RpcMessageType.Ping,
              }),
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
            Object.values(wss.clientsDict).forEach((wsClient) => {
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

      ws.on("error", (err) => {
        console.error(`clientID: ${clientID} ${path} error:`, err);
        ws.close();
      });

      ws.on("close", (code, reason) => {
        console.log(
          `clientID: ${clientID} close, ${path}, code: ${code}, reason: ${reason}`,
        );
        if (isServer) {
          const notification: RpcNotificationMessage<null> = {
            type: RpcMessageType.Notification,
            method: "server-gone",
            data: null,
          };
          const message = JSON.stringify(notification);

          Object.values(wss.clientsDict).forEach((wsClient) => {
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
