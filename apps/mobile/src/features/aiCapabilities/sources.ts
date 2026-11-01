// 工具来源的展示与启停：宿主工具组和插件 MCP 的开关存本机偏好，
// 自定义服务器的启停写入原生设置并把返回的公开清单并回应用设置。

import { useAppContext } from "../../app/AppContext";
import { toast } from "../../components/toast";
import {
  useCapabilityPreferences,
  useLibraryPreferences,
} from "../../services/aiChat/capabilityPreferences";
import { mutateCustomMcpServers } from "../../services/aiChat/customMcp";
import type { CustomMcpServer } from "../../types";
import type { ToolSource } from "./data";

/** 副标题：状态 + 工具数；停用和缺配置优先说明原因 */
export function sourceStatus(source: ToolSource, enabled: boolean) {
  if (!enabled) return { tone: "idle" as const, text: "已停用" };
  if (source.status === "unavailable")
    return { tone: "idle" as const, text: "需要先配置图片生成服务" };
  if (source.status === "error")
    return { tone: "error" as const, text: `连接失败${source.error ? ` · ${source.error}` : ""}` };
  if (source.status === "connecting") return { tone: "wait" as const, text: "正在连接…" };
  if (source.status === "disconnected") return { tone: "idle" as const, text: "未连接" };
  const writes = source.tools.filter(tool => tool.risk !== "read").length;
  const owner = source.pluginName ? `${source.pluginName} · ` : "";
  return {
    tone: "ok" as const,
    text: `${owner}${source.tools.length} 个工具${writes ? ` · ${writes} 个会修改` : " · 只读"}`,
  };
}

/** 原生返回的服务器清单并回应用设置，驱动连接同步与页面刷新 */
export function useApplyCustomServers() {
  const { updateSetting } = useAppContext().syncSettings;
  return (servers: CustomMcpServer[]) =>
    updateSetting(previous => ({ ...previous, mcpServers: servers }));
}

export function useSourceEnabled(databaseName: string) {
  const preferences = useLibraryPreferences(databaseName);
  const setSourceEnabled = useCapabilityPreferences(state => state.setSourceEnabled);
  const applyServers = useApplyCustomServers();
  const isEnabled = (source: ToolSource) =>
    source.kind === "custom"
      ? (source.custom?.enabled ?? false)
      : !preferences.disabledSources.includes(source.id);
  const setEnabled = async (source: ToolSource, enabled: boolean) => {
    if (source.kind !== "custom") return setSourceEnabled(databaseName, source.id, enabled);
    if (!source.custom) return;
    try {
      applyServers(
        await mutateCustomMcpServers({ kind: "setEnabled", id: source.custom.id, enabled })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };
  return { isEnabled, setEnabled };
}
