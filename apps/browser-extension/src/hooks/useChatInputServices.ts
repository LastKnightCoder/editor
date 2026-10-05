import { useMemo } from "react";
import type { ChatInputAreaServices } from "@tau/shared";
import type WebSocketClient from "../utils/WebSocketClient";

/** 对话输入框的宿主服务：附件上传、本地路径转预览地址都经 aiServer 交给桌面 */
export function useChatInputServices(client: WebSocketClient | null): ChatInputAreaServices {
  return useMemo(
    () => ({
      uploadFile: async (file: File) => {
        if (!client?.isConnected) throw new Error("WebSocket 未连接");
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const result = (await client.sendRequest("resource.upload", {
          data: base64,
          name: file.name,
          type: file.type,
        })) as { url: string | null };
        return result.url;
      },
      convertFileSrc: async (path: string) => {
        if (!client?.isConnected) return path;
        const result = (await client.sendRequest("file.convertFileSrc", { path })) as {
          url: string;
        };
        return result.url;
      },
      getHomeDir: async () => {
        if (!client?.isConnected) return "";
        const result = (await client.sendRequest("file.getHomeDir", {})) as { homeDir: string };
        return result.homeDir;
      },
    }),
    [client]
  );
}
