import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { RpcMessageType, RpcNotificationMessage } from "../utils/rpc-protocol.js";

const RPC_PORT = 24678;
const RPC_PATH = "/backendServer";
const CONNECT_TIMEOUT = 500;

/**
 * Fire-and-forget notification to the running app.
 * If the app is not running, silently fails.
 */
export async function notifyApp(method: string, data?: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${RPC_PORT}${RPC_PATH}`;
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Connection timeout"));
    }, CONNECT_TIMEOUT);

    ws.on("open", () => {
      clearTimeout(timeout);
      const notification: RpcNotificationMessage = {
        type: RpcMessageType.Notification,
        method,
        data: data ?? null,
      };
      ws.send(JSON.stringify(notification));
      ws.close();
      resolve();
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Connection failed"));
    });
  });
}

/**
 * Check if the Tau app is running by probing the RPC port.
 * Uses a short timeout (500ms) to avoid blocking.
 */
export async function isAppRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${RPC_PORT}${RPC_PATH}`);

    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, CONNECT_TIMEOUT);

    ws.on("open", () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}
