/**
 * 对话工作目录的数据源：实际目录 + 仓库分支（对话栏、设置页共用）。
 * 分支可能在应用外被切换，窗口聚焦时刷新。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { piWorkspaceBranches, piWorkspaceCheckout, piWorkspaceInfo } from "@/commands/piSession";

const workspaceKey = (cwd: string) => ["chat-workspace", cwd] as const;

/** cwd 为空即应用数据目录；主进程负责解析与存在性判断 */
export function useWorkspaceInfo(cwd: string) {
  return useQuery({
    queryKey: [...workspaceKey(cwd), "info"],
    queryFn: async () => {
      const outcome = await piWorkspaceInfo(cwd);
      if (!outcome.ok || !outcome.info) throw new Error(outcome.error ?? "读取工作目录失败");
      return outcome.info;
    },
    refetchOnWindowFocus: true,
  });
}

/** 本地分支列表：只在分支菜单打开时拉取 */
export function useWorkspaceBranches(cwd: string, enabled: boolean) {
  return useQuery({
    queryKey: [...workspaceKey(cwd), "branches"],
    queryFn: async () => {
      const outcome = await piWorkspaceBranches(cwd);
      if (!outcome.ok) throw new Error(outcome.error ?? "读取分支失败");
      return outcome.branches ?? [];
    },
    enabled,
    staleTime: 0,
  });
}

export function useWorkspaceCheckout(cwd: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (branch: string) => {
      const outcome = await piWorkspaceCheckout(cwd, branch);
      if (!outcome.ok) throw new Error(outcome.error ?? "切换分支失败");
    },
    // 同一仓库可能被多个对话以不同子目录打开：整组刷新
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["chat-workspace"] }),
  });
}
