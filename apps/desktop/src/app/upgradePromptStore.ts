/**
 * 通用升级提示弹窗的壳层状态（归 app 层，遵循 features 域禁止互引 store 规则）。
 *
 * 任意业务域（日程、白板、协作、插件等）只需调用 promptAppUpgrade / promptAppUpgradeFromError，
 * 由挂在 AppShell（AutoUpdateChecker）内的 UpgradePromptHost 统一承接展示与更新闭环。
 */

import { create } from "zustand";
import { parseUpgradeRequiredError, type UpgradePromptRequest } from "@tau/shared/upgrade-prompt";

interface UpgradePromptState {
  open: boolean;
  request: UpgradePromptRequest | null;
  show: (request: UpgradePromptRequest) => void;
  close: () => void;
  clear: () => void;
}

export const useUpgradePromptStore = create<UpgradePromptState>()(set => ({
  open: false,
  request: null,
  show: request => set({ open: true, request }),
  close: () => set({ open: false }),
  clear: () => set({ request: null }),
}));

export function promptAppUpgrade(request: UpgradePromptRequest): void {
  useUpgradePromptStore.getState().show(request);
}

/** 若错误属于「需要升级 Tau 才能继续」，打开通用升级提示并返回 true；否则返回 false 交给调用方走常规报错。 */
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
