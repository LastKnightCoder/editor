import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import {
  RpcMessageType,
  RpcRequestMessage,
  RpcResponseMessage,
  isRpcResponseMessage,
} from "../utils/rpc-protocol.js";

const RPC_PORT = 24678;
const RPC_PATH = "/backendServer";
const DEFAULT_TIMEOUT = 5000;

export async function rpcRequest<T = unknown>(
  method: string,
  params: unknown[] = [],
  options?: { timeoutMs?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;
  const id = randomUUID();

  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${RPC_PORT}${RPC_PATH}`;
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`RPC timeout after ${timeoutMs}ms for method: ${method}`));
    }, timeoutMs);

    ws.on("open", () => {
      const request: RpcRequestMessage<unknown[]> = {
        id,
        type: RpcMessageType.Request,
        method,
        params,
      };
      ws.send(JSON.stringify(request));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (isRpcResponseMessage(msg) && msg.id === id) {
          clearTimeout(timeout);
          ws.close();
          if (msg.error) {
            reject(new Error(msg.error.message || `RPC error: ${method}`));
          } else {
            resolve(msg.result as T);
          }
        }
      } catch {
        // ignore non-matching messages
      }
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to connect to Tau app (port ${RPC_PORT})`));
    });
  });
}
