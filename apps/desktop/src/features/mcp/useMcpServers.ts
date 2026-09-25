/**
 * MCP 页的数据层：把内置 provider 与自定义服务器合成统一的列表项，并收拢启停 / 保存 /
 * 重连 / 删除等写操作。连接本身由 tools/index.ts 订阅 store 驱动——这里只改 store，
 * 需要先断开旧连接的场景（停用、改配置、删除）显式断开。
 */

import { useEffect, useMemo, useState } from "react";
import { MCP_PROVIDERS, type MCPProviderDefinition } from "@/mcp/providers";
import useMCPStore, { type CustomMCPServer, type MCPServerToolInfo } from "@/stores/useMCPStore";
import useSettingStore from "@/stores/useSettingStore";
import { disconnectFromServer } from "@/tools/customMCP";
import { reloadCustomServer } from "@/tools";
import { clearMcpServerLogs, getMcpServerLogs, type McpLogEntry } from "@/commands/mcp";
import { off, on } from "@/electron";
import type { SettingsSectionKey } from "@/features/settings/sections";
import { describeTransport, draftToPayload, type ServerDraft } from "./serverConfig";

/** ready = 可用；off = 已停用；unavailable = 内置但依赖的配置缺失 */
export type McpServerStatus = "ready" | "connecting" | "error" | "off" | "unavailable";

export interface McpServerItem {
  id: string;
  kind: "builtin" | "custom";
  name: string;
  description: string;
  enabled: boolean;
  status: McpServerStatus;
  error?: string;
  tools: MCPServerToolInfo[];
  disabledTools: Set<string>;
  /** 自定义：启动命令或 URL */
  target?: string;
  /** 内置不可用时去哪个设置分区补配置 */
  settingsSection?: SettingsSectionKey;
  server?: CustomMCPServer;
}

const UNAVAILABLE_HINT: Record<string, { text: string; section: SettingsSectionKey }> = {
  "openai-image-tools": { text: "需要先配置图片生成服务", section: "imageGeneration" },
};

function builtinItem(
  provider: MCPProviderDefinition,
  enabled: boolean,
  disabled: string[] | undefined
): McpServerItem {
  const available = provider.isAvailable?.() ?? true;
  return {
    id: provider.id,
    kind: "builtin",
    name: provider.name,
    description: provider.description,
    enabled,
    status: !available ? "unavailable" : enabled ? "ready" : "off",
    error: available ? undefined : (UNAVAILABLE_HINT[provider.id]?.text ?? "当前不可用"),
    settingsSection: available ? undefined : UNAVAILABLE_HINT[provider.id]?.section,
    tools: provider.tools().map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    })),
    disabledTools: new Set(disabled),
  };
}

export function useMcpServers() {
  const providerStates = useMCPStore(s => s.providerStates);
  const customServers = useMCPStore(s => s.customServers);
  const connectionStatus = useMCPStore(s => s.connectionStatus);
  const connectionErrors = useMCPStore(s => s.connectionErrors);
  const disabledTools = useMCPStore(s => s.disabledTools);
  const serverTools = useMCPStore(s => s.serverTools);
  // 图片生成 provider 的可用性取决于设置
  const imageGeneration = useSettingStore(s => s.setting.imageGeneration);

  const builtin = useMemo(
    () =>
      MCP_PROVIDERS.map(provider =>
        builtinItem(
          provider,
          providerStates[provider.id]?.enabled ?? provider.defaultEnabled ?? false,
          disabledTools[provider.id]
        )
      ),
    // imageGeneration 变化时重新判定 isAvailable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerStates, disabledTools, imageGeneration]
  );

  const custom = useMemo(
    () =>
      customServers.map((server): McpServerItem => {
        const connection = connectionStatus[server.id];
        const status: McpServerStatus = !server.enabled
          ? "off"
          : connection === "connected"
            ? "ready"
            : connection === "error"
              ? "error"
              : "connecting";
        return {
          id: server.id,
          kind: "custom",
          name: server.name,
          description: server.description ?? "",
          enabled: server.enabled,
          status,
          error: status === "error" ? connectionErrors[server.id] : undefined,
          tools: serverTools[server.id] ?? [],
          disabledTools: new Set(disabledTools[server.id]),
          target: describeTransport(server.transport),
          server,
        };
      }),
    [customServers, connectionStatus, connectionErrors, disabledTools, serverTools]
  );

  return { builtin, custom };
}

/** 已启用且连接失败的自定义服务器数（侧栏徽标） */
export function useMcpErrorCount(): number {
  const customServers = useMCPStore(s => s.customServers);
  const connectionStatus = useMCPStore(s => s.connectionStatus);
  return customServers.filter(s => s.enabled && connectionStatus[s.id] === "error").length;
}

export async function setServerEnabled(item: McpServerItem, enabled: boolean) {
  const store = useMCPStore.getState();
  if (item.kind === "builtin") {
    store.setProviderEnabled(item.id, enabled);
    return;
  }
  store.setCustomServerEnabled(item.id, enabled);
  if (!enabled) await disconnectFromServer(item.id).catch(() => undefined);
}

export function setToolsEnabled(item: McpServerItem, toolNames: string[], enabled: boolean) {
  useMCPStore.getState().setToolsEnabled(item.id, toolNames, enabled);
}

/** 新建返回新 id；编辑时先断开旧连接，store 更新后按新配置重连 */
export async function saveServer(draft: ServerDraft, existingId?: string): Promise<string> {
  const store = useMCPStore.getState();
  const payload = draftToPayload(draft);
  if (!existingId) return store.addCustomServer(payload).id;
  await disconnectFromServer(existingId).catch(() => undefined);
  store.updateCustomServer(existingId, payload);
  return existingId;
}

/** 批量导入：同名服务器覆盖配置，其余新建 */
export async function importServers(drafts: ServerDraft[]) {
  const byName = new Map(useMCPStore.getState().customServers.map(s => [s.name, s.id]));
  for (const draft of drafts) {
    await saveServer(draft, byName.get(draft.name.trim()));
  }
}

export async function reconnectServer(serverId: string) {
  const server = useMCPStore.getState().getCustomServer(serverId);
  if (server?.enabled) await reloadCustomServer(server);
}

export async function removeServer(serverId: string) {
  await disconnectFromServer(serverId).catch(() => undefined);
  await clearMcpServerLogs(serverId).catch(() => undefined);
  useMCPStore.getState().removeCustomServer(serverId);
}

/** 服务器日志：先拉取主进程缓冲，再实时追加推送的新行 */
export function useMcpLogs(serverId: string | null) {
  const [lines, setLines] = useState<McpLogEntry[]>([]);

  useEffect(() => {
    setLines([]);
    if (!serverId) return;
    let cancelled = false;
    const pending: McpLogEntry[] = [];
    let loaded = false;
    const handler = (_event: unknown, data: { serverId: string; entry: McpLogEntry }) => {
      if (data.serverId !== serverId) return;
      if (!loaded) pending.push(data.entry);
      else setLines(prev => [...prev.slice(-199), data.entry]);
    };
    on("mcp-log", handler);
    void getMcpServerLogs(serverId)
      .then(initial => {
        if (cancelled) return;
        loaded = true;
        const last = initial[initial.length - 1]?.time ?? 0;
        setLines([...initial, ...pending.filter(e => e.time > last)].slice(-200));
      })
      .catch(() => {
        loaded = true;
      });
    return () => {
      cancelled = true;
      off("mcp-log", handler);
    };
  }, [serverId]);

  const clear = async () => {
    if (!serverId) return;
    await clearMcpServerLogs(serverId);
    setLines([]);
  };

  return { lines, clear };
}
