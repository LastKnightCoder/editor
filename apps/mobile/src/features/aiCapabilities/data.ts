// Skill 与 MCP 管理页的数据：Skill 目录走 react-query（按插件来源版本刷新），
// 工具与连接状态订阅 AI 服务的 MCP 快照与插件 MCP 快照。

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AiSkillDescriptor } from "@tau/ai/skills";
import type { AiMcpServerState } from "@tau/ai/mcp";
import type { AiToolSpec } from "@tau/ai/contracts";
import { useAppContext } from "../../app/AppContext";
import { useMobilePlugins } from "../../app/plugins/context";
import type { MobilePluginMcpState } from "../../app/plugins/ai-mcp";
import type { MobileAiService } from "../../services/ai";
import {
  chatCapabilities,
  listAllSkills,
  readSkillDocument,
} from "../../services/aiChat/chatController";
import { HOST_TOOL_GROUPS, toolSourceOf } from "../../services/aiChat/tool";
import { CUSTOM_MCP_PREFIX } from "../../services/aiChat/customMcp";
import { INTERNAL_SKILL_SOURCE_ID } from "../../services/aiChat/skills";
import type { CustomMcpServer } from "../../types";

const subscribeEmpty = () => () => undefined;
const zero = () => 0;

export function useDatabaseName() {
  const app = useAppContext();
  return (
    app.syncSettings.safeSetting?.database?.active ?? app.bootstrap.databases?.activeDatabase ?? ""
  );
}

export type SkillSourceKind = "internal" | "plugin" | "skills";

export interface SkillItem {
  skill: AiSkillDescriptor;
  kind: SkillSourceKind;
  /** 插件或 Skill 包的名称；内置为空 */
  sourceName: string | null;
}

export function useSkillCatalog() {
  const databaseName = useDatabaseName();
  const runtime = useMobilePlugins();
  const sources = runtime?.aiSkills;
  const revision = useSyncExternalStore(
    sources?.subscribe ?? subscribeEmpty,
    sources ? () => sources.getSnapshot().revision : zero,
    zero
  );
  const query = useQuery({
    queryKey: ["ai-capabilities", "skills", databaseName, revision],
    queryFn: ({ signal }) => listAllSkills(databaseName, signal),
    enabled: !!databaseName,
    refetchOnWindowFocus: true,
  });
  const names = new Map(runtime?.host.listPlugins().map(plugin => [plugin.id, plugin.name]));
  const items: SkillItem[] = (query.data ?? []).map(skill => {
    if (skill.sourceId === INTERNAL_SKILL_SOURCE_ID)
      return { skill, kind: "internal", sourceName: null };
    const kind = runtime?.aiPackageKind(skill.sourceId) === "plugin" ? "plugin" : "skills";
    return { skill, kind, sourceName: names.get(skill.sourceId) ?? null };
  });
  return {
    databaseName,
    query,
    items,
    sourceError: sources?.getSnapshot().error ?? null,
    retrySources: () => void sources?.refresh().catch(() => undefined),
  };
}

export function useSkillDocument(databaseName: string, id: string) {
  return useQuery({
    queryKey: ["ai-capabilities", "skill-document", databaseName, id],
    queryFn: ({ signal }) => readSkillDocument(databaseName, id, signal),
    enabled: !!databaseName,
  });
}

/** 工具来源：宿主功能组 / 插件 MCP / 自定义服务器，统一成一个管理条目 */
export interface ToolSource {
  id: string;
  kind: "host" | "plugin" | "custom";
  name: string;
  description: string;
  status: "connected" | "connecting" | "error" | "disconnected" | "unavailable";
  error?: string;
  tools: AiToolSpec[];
  pluginId?: string;
  pluginName?: string;
  custom?: CustomMcpServer;
  /** 宿主工具缺少前置配置时去哪补 */
  needsSetup?: "image-generation";
}

/** passive 时不主动加载 AI 服务（「我的」页只读已有快照，不触发连接） */
function useService(databaseName: string, passive: boolean) {
  return useQuery({
    queryKey: ["ai-capabilities", "service", databaseName],
    queryFn: () => chatCapabilities(databaseName),
    enabled: !!databaseName && !passive,
    staleTime: Infinity,
  }).data;
}

function useMcpStates(service: MobileAiService | undefined, databaseName: string) {
  const subscribe = (listener: () => void) =>
    service ? service.mcp.subscribe(databaseName, listener) : () => undefined;
  const snapshot = () => (service ? JSON.stringify(service.mcp.list(databaseName)) : "[]");
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return JSON.parse(raw) as AiMcpServerState[];
}

function usePluginMcpStates(): readonly MobilePluginMcpState[] {
  const runtime = useMobilePlugins();
  const mcp = runtime?.aiMcp;
  return useSyncExternalStore(
    mcp?.subscribe ?? subscribeEmpty,
    mcp ? mcp.getSnapshot : () => EMPTY_PLUGIN_STATES,
    () => EMPTY_PLUGIN_STATES
  );
}
const EMPTY_PLUGIN_STATES: readonly MobilePluginMcpState[] = Object.freeze([]);

const statusOf = (status: AiMcpServerState["status"] | MobilePluginMcpState["status"]) =>
  status === "connected"
    ? "connected"
    : status === "connecting" || status === "preparing"
      ? "connecting"
      : status === "disconnected"
        ? "disconnected"
        : "error";

export function useToolSources(options: { passive?: boolean } = {}) {
  const databaseName = useDatabaseName();
  const app = useAppContext();
  const service = useService(databaseName, !!options.passive);
  const mcpStates = useMcpStates(service, databaseName);
  const pluginStates = usePluginMcpStates();
  // 插件 MCP 快照不含工具元数据，工具规格从注册表读；连接状态变化时重新计算
  const specs = service ? service.tools.list({ databaseName }) : [];
  const setting = app.syncSettings.safeSetting;
  const imageReady = !!setting?.imageGeneration?.providers.some(
    provider => provider.id === setting.imageGeneration?.currentProviderId
  );
  const toolsOf = (sourceId: string) => specs.filter(spec => toolSourceOf(spec) === sourceId);

  const host: ToolSource[] = HOST_TOOL_GROUPS.map(group => ({
    id: group.id,
    kind: "host",
    name: group.name,
    description: group.description,
    status: group.id === "host:images" && !imageReady ? "unavailable" : "connected",
    tools: toolsOf(group.id),
    ...(group.id === "host:images" && !imageReady ? { needsSetup: "image-generation" } : {}),
  }));

  const plugin: ToolSource[] = pluginStates.map(state => {
    // 远程插件 MCP 的工具 sourceId 是插件条目 id；内联工具同样以条目 id 作为 sourceId
    const tools = specs.filter(spec => state.toolIds.includes(spec.id));
    return {
      id: state.id,
      kind: "plugin",
      name: state.name,
      description: "",
      status: statusOf(state.status),
      error: state.error,
      tools,
      pluginId: state.pluginId,
      pluginName: state.pluginName,
    };
  });

  const custom: ToolSource[] = (setting?.mcpServers ?? []).map(server => {
    const state = mcpStates.find(item => item.id === `${CUSTOM_MCP_PREFIX}${server.id}`);
    return {
      id: `${CUSTOM_MCP_PREFIX}${server.id}`,
      kind: "custom",
      name: server.name,
      description: server.url,
      status: !server.enabled
        ? "disconnected"
        : state
          ? state.status === "unsupported_transport"
            ? "error"
            : statusOf(state.status)
          : service
            ? "connecting"
            : "disconnected",
      error: state?.error,
      tools: state ? specs.filter(spec => state.toolIds.includes(spec.id)) : [],
      custom: server,
    };
  });

  return { databaseName, service, host, plugin, custom, all: [...custom, ...host, ...plugin] };
}
