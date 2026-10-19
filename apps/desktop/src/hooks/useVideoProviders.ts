import { useSyncExternalStore } from "react";
import { getVideoProviders, subscribeVideoProviders } from "@/commands/plugin-video";

/** 当前已启用的在线视频提供方（所有窗口一致）；ready 前列表可能尚不完整。 */
export const useVideoProviders = () =>
  useSyncExternalStore(subscribeVideoProviders, getVideoProviders);

/** 提供方显示名；插件未启用时退回 ID。 */
export function useVideoProviderName(providerId: string | undefined) {
  const { providers } = useVideoProviders();
  if (!providerId) return undefined;
  return providers.find(provider => provider.id === providerId)?.name ?? providerId;
}
