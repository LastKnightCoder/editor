import { create } from "zustand";
import { parseUpgradeRequiredError, type UpgradePromptRequest } from "@tau/shared/upgrade-prompt";

interface MobileUpgradePromptState {
  open: boolean;
  request: UpgradePromptRequest | null;
  show: (request: UpgradePromptRequest) => void;
  close: () => void;
}

export const useMobileUpgradePromptStore = create<MobileUpgradePromptState>(set => ({
  open: false,
  request: null,
  show: request => set({ open: true, request }),
  close: () => set({ open: false }),
}));

export function promptAppUpgrade(request: UpgradePromptRequest): void {
  useMobileUpgradePromptStore.getState().show(request);
}

/** 若错误属于「需要升级 Tau 才能继续」，拉起通用升级弹层并返回 true。 */
export function promptAppUpgradeFromError(
  error: unknown,
  overrides?: Partial<UpgradePromptRequest>
): boolean {
  const matched = parseUpgradeRequiredError(error);
  if (!matched) return false;
  promptAppUpgrade({
    reason: matched.reason,
    minAppVersion: matched.minAppVersion,
    rawError: matched.rawMessage,
    ...overrides,
  });
  return true;
}
