import { useQuery } from "@tanstack/react-query";
import { listAgentPermissions, listContentSuggestions } from "@/commands/content";
import { bindDatabaseCommands } from "@/services/command-context";
import { isElectron, on } from "@/electron";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import {
  CONTENT_AGENT_PERMISSIONS_CHANGED,
  CONTENT_SUGGESTIONS_CHANGED,
  type AgentPermissionLevel,
  type ContentAgentPermissionsChange,
  type ContentSuggestionsChange,
} from "@/types/content-suggestion";

const databaseId = (database: string) => database.replace(/\.db$/, "");

export const suggestionKeys = {
  root: (database: string) => ["content-suggestions", databaseId(database)] as const,
  content: (database: string, contentId: number) =>
    [...suggestionKeys.root(database), "content", contentId] as const,
  proposal: (database: string, proposalId: string) =>
    [...suggestionKeys.root(database), "proposal", proposalId] as const,
  item: (database: string, contentId: number, suggestionId: string) =>
    [...suggestionKeys.root(database), "item", contentId, suggestionId] as const,
};

// 显式绑定全局 queryClient：对话工具卡与正文编辑器可能挂在独立渲染根里，不保证在 Provider 下
// 主进程是建议的唯一来源：任一窗口处理后广播，所有视图按库失效重读
on(CONTENT_SUGGESTIONS_CHANGED, (_event, change: ContentSuggestionsChange) => {
  void queryClient.invalidateQueries({ queryKey: suggestionKeys.root(change.databaseName) });
});

const permissionKey = (database: string, contentId: number) =>
  ["content-agent-permissions", databaseId(database), contentId] as const;

on(CONTENT_AGENT_PERMISSIONS_CHANGED, (_event, change: ContentAgentPermissionsChange) => {
  void queryClient.invalidateQueries({
    queryKey: permissionKey(change.databaseName, change.contentId),
  });
});

/** 这篇正文上各 Agent 的权限（没有记录的 Agent 即「建议」） */
export function useAgentPermissions(contentId: number | undefined, databaseName?: string) {
  const active = useSettingStore(state => state.setting.database.active);
  const database = databaseName ?? active;
  return useQuery(
    {
      queryKey: permissionKey(database, contentId ?? 0),
      queryFn: () =>
        bindDatabaseCommands(
          { listAgentPermissions },
          { databaseName: database }
        ).listAgentPermissions(contentId ?? 0),
      enabled: isElectron && Boolean(contentId) && Boolean(database),
      staleTime: 5 * 60_000,
    },
    queryClient
  );
}

export const permissionOf = (
  permissions: { agent: string; level: AgentPermissionLevel }[] | undefined,
  agent: string
): AgentPermissionLevel => permissions?.find(item => item.agent === agent)?.level ?? "suggest";

/** 正文视图用：该正文待处理与刚接受的建议，打开正文时即取，不依赖发起端窗口。 */
export function useContentSuggestions(contentId: number | undefined, databaseName?: string) {
  const active = useSettingStore(state => state.setting.database.active);
  const database = databaseName ?? active;
  return useQuery(
    {
      queryKey: suggestionKeys.content(database, contentId ?? 0),
      queryFn: () =>
        bindDatabaseCommands(
          { listContentSuggestions },
          { databaseName: database }
        ).listContentSuggestions({ contentId }),
      enabled: isElectron && contentId !== undefined && Boolean(database),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
    queryClient
  );
}

/** 正文定位按条读取历史记录，不受正文近期列表的时限或条数限制。 */
export function useFocusedContentSuggestion(
  contentId: number | undefined,
  suggestionId: string | undefined
) {
  const database = useSettingStore(state => state.setting.database.active);
  return useQuery(
    {
      queryKey: suggestionKeys.item(database, contentId ?? 0, suggestionId ?? ""),
      queryFn: async () => {
        const [suggestion] = await bindDatabaseCommands(
          { listContentSuggestions },
          { databaseName: database }
        ).listContentSuggestions({ contentId, suggestionId });
        return suggestion ?? null;
      },
      enabled: isElectron && contentId !== undefined && Boolean(suggestionId) && Boolean(database),
      staleTime: 30_000,
    },
    queryClient
  );
}

/** 对话卡片用：一次提案的全部条目及其状态。 */
export function useProposalSuggestions(proposalId: string | undefined, databaseName?: string) {
  const active = useSettingStore(state => state.setting.database.active);
  const database = databaseName ?? active;
  return useQuery(
    {
      queryKey: suggestionKeys.proposal(database, proposalId ?? ""),
      queryFn: () =>
        bindDatabaseCommands(
          { listContentSuggestions },
          { databaseName: database }
        ).listContentSuggestions({ proposalId }),
      enabled: isElectron && Boolean(proposalId) && Boolean(database),
      staleTime: 30_000,
    },
    queryClient
  );
}
