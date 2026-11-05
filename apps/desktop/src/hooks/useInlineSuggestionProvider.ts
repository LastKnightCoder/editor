import { useMemo } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { createDesktopInlineSuggestionProvider } from "@/commands/inline-suggestions";
import { INLINE_SUGGESTION_SLOT } from "@/types/inline-suggestions";
import { isElectron } from "@/electron";

export function useInlineSuggestionProvider(enabled: boolean, shared: boolean) {
  const model = useSettingStore(state => state.setting.llmUsageSettings?.[INLINE_SUGGESTION_SLOT]);
  const allowShared = useSettingStore(state => state.setting.inlineSuggestionShared === true);
  const providerId = model?.providerId;
  const modelId = model?.modelId;
  const active = isElectron && enabled && (!shared || allowShared);
  return useMemo(
    () =>
      active && providerId && modelId
        ? createDesktopInlineSuggestionProvider({ providerId, modelId }, shared)
        : undefined,
    [active, providerId, modelId, shared]
  );
}
