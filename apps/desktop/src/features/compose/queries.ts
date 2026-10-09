/**
 * 创作模式的数据：素材板走 react-query；建板、改意图、移走、召集是显式动作（mutation）。
 * 召集复用「AI 洞见」槽，没配时不提供自动找资料。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  cancelComposeGather,
  dismissComposeItems,
  ensureComposeBoard,
  gatherComposeMaterials,
  getComposeBoard,
  onComposeGatherPhase,
  setComposeIntent,
} from "@/commands/compose";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import type { ComposeBoard, GatherInput, GatherPhase } from "@/types/compose";
import { useInsightsEnabled } from "@/features/insights/queries";

const databaseId = (database: string) => database.replace(/\.db$/, "");

export const composeBoardKey = (database: string, contentId: number) =>
  ["compose-board", databaseId(database), contentId] as const;

/** 自动找资料可用：配了「AI 洞见」模型 */
export const useGatherEnabled = useInsightsEnabled;

export function useComposeBoard(contentId: number) {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  const queryClient = useQueryClient();
  const key = composeBoardKey(database, contentId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getComposeBoard(contentId),
    enabled: connected && contentId > 0,
  });
  const write = (board: ComposeBoard | null) => {
    if (board) queryClient.setQueryData(key, board);
  };
  const ensure = useMutation({
    mutationFn: (intent: string) => ensureComposeBoard(contentId, intent),
    onSuccess: write,
  });
  const setIntent = useMutation({
    mutationFn: (intent: string) => setComposeIntent(contentId, intent),
    onSuccess: write,
  });
  const dismiss = useMutation({
    mutationFn: (keys: string[]) => dismissComposeItems(contentId, keys),
    onSuccess: write,
  });
  return {
    board: query.data ?? null,
    loading: query.isPending && query.fetchStatus !== "idle",
    ensure,
    setIntent,
    dismiss,
  };
}

export function useGather(contentId: number) {
  return useMutation({
    mutationFn: (input: Omit<GatherInput, "contentId">) =>
      gatherComposeMaterials({ ...input, contentId }),
  });
}

export const cancelGather = cancelComposeGather;

/** 召集中的阶段（只收这一份正文的） */
export function useGatherPhase(contentId: number, active: boolean) {
  const [phase, setPhase] = useState<GatherPhase | null>(null);
  useEffect(() => {
    if (!active) {
      setPhase(null);
      return;
    }
    return onComposeGatherPhase(next => {
      if (next.contentId === contentId) setPhase(next);
    });
  }, [active, contentId]);
  return phase;
}
