// 用户添加的远程 MCP（Streamable HTTP）：配置由原生保存，请求头不回传页面；
// 本模块把启用中的服务器按库连接到 AI 服务，配置变化或停用时断开重连。

import { invoke } from "@tauri-apps/api/core";
import type { MobileAiService } from "../ai";
import { getMobileSettingSnapshot, subscribeMobileSettingSnapshot } from "../mobileSettingsBridge";
import { enqueueProviderConfigWrite } from "../provider-config";
import type { CustomMcpServer, CustomMcpServersMutation } from "../../types";

export const CUSTOM_MCP_PREFIX = "custom:";
export const customMcpConnectionId = (serverId: string) => `${CUSTOM_MCP_PREFIX}${serverId}`;

export function mutateCustomMcpServers(mutation: CustomMcpServersMutation) {
  return enqueueProviderConfigWrite(() =>
    invoke<CustomMcpServer[]>("ai_mcp_servers_mutate", { mutation })
  );
}

const signature = (server: CustomMcpServer) =>
  JSON.stringify([server.name, server.url, server.headerNames]);

/** 让 AI 服务的连接与设置里的服务器清单一致；返回停止同步并断开全部连接的函数 */
export function syncCustomMcpServers(service: MobileAiService, databaseName: string) {
  const connected = new Map<string, string>();
  let stopped = false;
  const reconcile = () => {
    if (stopped) return;
    const servers = (getMobileSettingSnapshot()?.mcpServers ?? []).filter(server => server.enabled);
    const wanted = new Map(servers.map(server => [server.id, server]));
    for (const [id] of connected)
      if (!wanted.has(id)) {
        connected.delete(id);
        void service.mcp.disconnect(databaseName, customMcpConnectionId(id)).catch(() => undefined);
      }
    for (const server of servers) {
      const next = signature(server);
      if (connected.get(server.id) === next) continue;
      connected.set(server.id, next);
      void connectCustomMcp(service, databaseName, server).catch(() => undefined);
    }
  };
  const unsubscribe = subscribeMobileSettingSnapshot(reconcile);
  reconcile();
  return () => {
    stopped = true;
    unsubscribe();
    for (const id of connected.keys())
      void service.mcp.disconnect(databaseName, customMcpConnectionId(id)).catch(() => undefined);
    connected.clear();
  };
}

export function connectCustomMcp(
  service: MobileAiService,
  databaseName: string,
  server: Pick<CustomMcpServer, "id" | "name" | "url">
) {
  return service.mcp.connect(
    databaseName,
    {
      id: customMcpConnectionId(server.id),
      name: server.name,
      // 请求头由原生按服务器 id 注入，这里只声明地址
      transport: { type: "streamable-http", url: server.url },
    },
    undefined,
    server.id
  );
}
