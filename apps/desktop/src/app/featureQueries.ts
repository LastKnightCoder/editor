/**
 * 功能开关数据：随工作区保存（主库 workspace_preferences）。改动先写缓存再落库，失败回滚。
 * 读不到时按全部打开处理，不挡住主界面。
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import {
  getWorkspacePreferences,
  saveWorkspacePreferences,
} from "@/commands/workspace-preferences";
import type { WorkspacePreferences } from "@/types/workspace-preferences";
import { isFeatureEnabled } from "./features";

const PREFERENCES_KEY = ["workspace", "preferences"] as const;
const EMPTY: readonly string[] = [];

export function useWorkspacePreferences() {
  return useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: getWorkspacePreferences,
    refetchOnWindowFocus: true,
  });
}

export function useSaveWorkspacePreferences() {
  const queryClient = useQueryClient();
  return (patch: Partial<WorkspacePreferences>): Promise<boolean> => {
    const previous = queryClient.getQueryData<WorkspacePreferences>(PREFERENCES_KEY);
    if (previous) queryClient.setQueryData(PREFERENCES_KEY, { ...previous, ...patch });
    return saveWorkspacePreferences(patch).then(
      saved => {
        queryClient.setQueryData(PREFERENCES_KEY, saved);
        return true;
      },
      () => {
        queryClient.setQueryData(PREFERENCES_KEY, previous);
        toast.error("功能设置保存失败");
        return false;
      }
    );
  };
}

export function useFeatures(): {
  disabled: readonly string[];
  isEnabled(id: string): boolean;
  setDisabled(next: string[]): Promise<boolean>;
} {
  const disabled = useWorkspacePreferences().data?.disabledFeatures ?? EMPTY;
  const save = useSaveWorkspacePreferences();
  const isEnabled = useCallback((id: string) => isFeatureEnabled(id, disabled), [disabled]);
  return {
    disabled,
    isEnabled,
    setDisabled: next => save({ disabledFeatures: next }),
  };
}

export function useFeatureEnabled(id: string): boolean {
  return useFeatures().isEnabled(id);
}
