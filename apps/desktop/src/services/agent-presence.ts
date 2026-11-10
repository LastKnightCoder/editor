/**
 * Agent 在正文上的在场：工具层上报（读到哪、改到哪、在等什么），正文视图与标题栏读取。
 * 上报是尽力而为：失败只记日志，不影响工具本身的执行与结果。
 */

import { useQuery } from "@tanstack/react-query";
import {
  clearAgentPresence,
  listAgentPresences,
  setAgentPresence,
} from "@/commands/agent-presence";
import { bindDatabaseCommands } from "@/services/command-context";
import { agentIdentity } from "@/services/agent-identity";
import { isElectron, on } from "@/electron";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import type { ToolExecutionContext } from "@/types";
import {
  CONTENT_AGENT_PRESENCE_CHANGED,
  type AgentPresenceChange,
  type AgentPresenceUpdate,
} from "@/types/agent-presence";

const databaseId = (database: string) => database.replace(/\.db$/, "");
const presenceKey = (database: string, contentId: number) =>
  ["content-agent-presence", databaseId(database), contentId] as const;

// 显式绑定全局 queryClient：标题栏头像与正文可能挂在独立渲染根里
on(CONTENT_AGENT_PRESENCE_CHANGED, (_event, change: AgentPresenceChange) => {
  void queryClient.invalidateQueries({
    queryKey: presenceKey(change.databaseName, change.contentId),
  });
});

/** 这篇正文上此刻在场的 Agent（打开正文时即取，Agent 关着正文时也照常更新） */
export function useAgentPresences(contentId: number | undefined, databaseName?: string) {
  const active = useSettingStore(state => state.setting.database.active);
  const database = databaseName ?? active;
  return useQuery(
    {
      queryKey: presenceKey(database, contentId ?? 0),
      queryFn: () =>
        bindDatabaseCommands({ listAgentPresences }, { databaseName: database }).listAgentPresences(
          contentId ?? 0
        ),
      enabled: isElectron && Boolean(contentId) && Boolean(database),
      staleTime: 60_000,
    },
    queryClient
  );
}

/** 工具调用里的 Agent 身份：子 Agent 用派发时的职责名，主对话为「助手」 */
export const presenceAgentOf = (context: ToolExecutionContext | undefined) =>
  agentIdentity(context?.toolContext?.agentTitle).name;

/** 上报 Agent 当前在这篇正文上的动作；没有会话键（一次性运行）时不上报，结束时无人清理 */
export function reportAgentPresence(
  context: ToolExecutionContext | undefined,
  contentId: number,
  update: Omit<AgentPresenceUpdate, "agent" | "owner">
) {
  const owner = context?.conversationKey;
  if (!isElectron || !owner || !contentId) return;
  void bindDatabaseCommands({ setAgentPresence }, { databaseName: context?.databaseName })
    .setAgentPresence(contentId, { ...update, agent: presenceAgentOf(context), owner })
    .catch(error => console.warn("[agent-presence] 上报失败", error));
}

export function clearReportedPresence(
  context: ToolExecutionContext | undefined,
  contentId: number
) {
  if (!isElectron || !context?.conversationKey || !contentId) return;
  void bindDatabaseCommands({ clearAgentPresence }, { databaseName: context.databaseName })
    .clearAgentPresence(contentId, presenceAgentOf(context))
    .catch(error => console.warn("[agent-presence] 清除失败", error));
}
