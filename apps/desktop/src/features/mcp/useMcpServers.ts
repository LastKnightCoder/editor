/**
 * MCP 页的数据层：把内置 provider 与自定义服务器合成统一的列表项，并收拢启停 / 保存 /
 * 重连 / 删除等写操作。连接本身由 tools/index.ts 订阅 store 驱动——这里只改 store，
 * 需要先断开旧连接的场景（停用、改配置、删除）显式断开。
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MCP_PROVIDERS, type MCPProviderDefinition } from "@/mcp/providers";
import useMCPStore, { type CustomMCPServer, type MCPServerToolInfo } from "@/stores/useMCPStore";
import useSettingStore from "@/stores/useSettingStore";
import { disconnectFromServer } from "@/tools/customMCP";
import toolRegistry, { reloadCustomServer } from "@/tools";
import type { ScopedToolSource } from "@/tools/toolRegistry";
import { clearMcpServerLogs, getMcpServerLogs, type McpLogEntry } from "@/commands/mcp";
import { off, on } from "@/electron";
import type { SettingsSectionKey } from "@/features/settings/sections";
import { PI_BUILTIN_TOOLS } from "./piBuiltinTools";
import { SCOPED_TOOL_GROUPS } from "./scopedToolCatalog";
import { describeTransport, draftToPayload, type ServerDraft } from "./serverConfig";
import {
  getPluginMCPServers,
  subscribePluginMCPServers,
  isPluginMCP,
  reconnectPluginMCP,
} from "@/tools/pluginMCP";

/** ready = 可用；off = 已停用；unavailable = 内置但依赖的配置缺失 */
export type McpServerStatus = "ready" | "connecting" | "error" | "off" | "unavailable";

export interface McpServerItem {
  id: string;
  /** scoped = 功能专属工具（PDF / 视频笔记 / 学习项目，常开）；pi = AI 助手自带工具 */
  kind: "builtin" | "custom" | "plugin" | "scoped" | "pi";
  pluginName?: string;
  connectionId?: string;
  name: string;
  description: string;
  enabled: boolean;
  status: McpServerStatus;
  error?: string;
  tools: MCPServerToolInfo[];
  disabledTools: Set<string>;
  /** 常开不可关（功能专属 / AI 内置），所有开关只读 */
  locked?: boolean;
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
  const pluginServers = useSyncExternalStore(subscribePluginMCPServers, getPluginMCPServers);
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

  const allCustom = useMemo(
    () => [
      ...custom,
      ...pluginServers.map((info): McpServerItem => {
        const enabled = providerStates[info.id]?.enabled ?? true;
        const connection = connectionStatus[info.id];
        return {
          ...info,
          description: info.description ?? "",
          kind: "plugin",
          enabled,
          status: !enabled
            ? "off"
            : connection === "connected"
              ? "ready"
              : connection === "error"
                ? "error"
                : "connecting",
          error: connectionErrors[info.id],
          tools: serverTools[info.id] ?? [],
          disabledTools: new Set(disabledTools[info.id]),
          target: info.server ? describeTransport(info.server.transport) : undefined,
        };
      }),
    ],
    [
      custom,
      pluginServers,
      providerStates,
      connectionStatus,
      connectionErrors,
      serverTools,
      disabledTools,
    ]
  );
  return { builtin, custom: allCustom };
}

/** 某个作用域注册的功能专属工具（Vibe Learning、视频笔记、PDF），常开不可关；无作用域返回 undefined */
export function useScopedToolSource(scope: string | undefined): ScopedToolSource | undefined {
  const sources = useSyncExternalStore(
    toolRegistry.subscribeScopedSources,
    toolRegistry.getScopedSources
  );
  return scope ? sources.find(source => source.scope === scope) : undefined;
}

/** 功能专属工具分组（静态目录，常驻展示；工具实例随对应功能页面打开时注册） */
export function getScopedServerItems(): McpServerItem[] {
  return SCOPED_TOOL_GROUPS.map(group => ({
    id: group.id,
    kind: "scoped" as const,
    name: group.label,
    description: group.description,
    enabled: true,
    status: "ready" as const,
    locked: true,
    tools: group.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
    disabledTools: new Set<string>(),
  }));
}

/** AI 助手自带的默认工具（静态展示，不经工具注册表；实现来自 pi 运行时，对用户不可见） */
export function getPiBuiltinServerItem(): McpServerItem {
  return {
    id: "pi-builtin-tools",
    kind: "pi",
    name: "AI 基础工具",
    description: "AI 助手自带的文件读取、编辑与命令执行工具，每次对话默认可用。",
    enabled: true,
    status: "ready",
    locked: true,
    tools: PI_BUILTIN_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
    })),
    disabledTools: new Set<string>(),
  };
}

/** 已启用且连接失败的自定义服务器数（侧栏徽标） */
export function useMcpErrorCount(): number {
  const { custom } = useMcpServers();
  return custom.filter(server => server.enabled && server.status === "error").length;
}

export async function setServerEnabled(item: McpServerItem, enabled: boolean) {
  if (item.locked) return;
  const store = useMCPStore.getState();
  if (item.kind === "builtin" || item.kind === "plugin") {
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
  if (isPluginMCP(existingId)) {
    store.setPluginTransport(existingId, payload.transport);
    return existingId;
  }
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
  if (isPluginMCP(serverId)) return reconnectPluginMCP(serverId);
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
