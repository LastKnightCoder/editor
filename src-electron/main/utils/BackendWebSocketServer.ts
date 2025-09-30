import {
  RpcNotificationMessage,
  RpcRequestMessage,
  RpcResponseMessage,
  RpcErrorResponse,
  RpcMessageType,
} from "@/types/rpc";
import WebSocket from "ws";
import WebSocketServer from "./WebSocketServer";
import { isRpcRequestMessage, isRpcResponseMessage } from "@/utils/rpc";

class BackendWebSocketServer {
  private server: WebSocketServer<RpcRequestMessage, WebSocket>;
  private messageHandlers: Record<
    string,
    (messgae: RpcRequestMessage) => Promise<RpcResponseMessage>
  >;

  constructor(port: number) {
    const url = `ws://localhost:${port}/backendServer?isServer=true`;
    this.server = new WebSocketServer<RpcRequestMessage, WebSocket>(url, {
      onMessage: this.onMessage.bind(this),
    });
    this.messageHandlers = {};
  }

  addMessageHandler(
    method: string,
    handler: (message: RpcRequestMessage) => Promise<RpcResponseMessage>,
  ) {
    if (this.messageHandlers[method]) {
      console.warn(`method ${method} is exists, override it`);
    }
    this.messageHandlers[method] = handler;
  }

  async onMessage(_ws: WebSocket, message: RpcRequestMessage) {
    if (isRpcRequestMessage(message)) {
      const { id, method } = message;
      const handler = this.messageHandlers[method as string];
      let result = null;
      let error = null;

      try {
        if (handler) {
          result = await Promise.resolve(handler(message));
          console.log("launcher recv method: ", method, "result: ", result);

          if (isRpcResponseMessage(result)) {
            this.sendResponse(result);
            return;
          } else if (typeof result === "undefined") {
            result = { OK: true };
          }
        } else {
          throw {
            code: 1,
            message: `No handler found for method: ${method}`,
          };
        }
      } catch (e) {
        console.error("Fail to handle lancher method:", method, e);
        error = {
          code: (e as RpcErrorResponse).code || 1,
          message:
            (e as RpcErrorResponse).message || `Failed to handle ${method}`,
        };
      }

      const response: RpcResponseMessage = {
        id,
        jsonrpc: "2.0",
        type: RpcMessageType.Response,
        method,
        result,
        error,
        private: null,
      };
      this.sendResponse(response);
    }
  }

  sendResponse(message: RpcResponseMessage) {
    this.server.sendMessage(JSON.stringify(message));
  }

  sendNotification(messageType: string, data: any = null) {
    const message: RpcNotificationMessage = {
      jsonrpc: "2.0",
      type: RpcMessageType.Notification,
      method: messageType,
      data: data,
    };

    this.server.sendMessage(JSON.stringify(message));
  }
}

export default BackendWebSocketServer;
