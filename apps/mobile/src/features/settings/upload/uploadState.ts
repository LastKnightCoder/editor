// 「图片与附件」目的地卡的状态推导：把当前上传位置、配置完整性与最近上传结果翻译成一行状态
// 和修复入口（纯函数，便于单测）。

import type { UploadOutcome } from "../../../services/uploadOutcome";
import { formatRelativeTime } from "../storage/format";
import type { StorageLocale } from "../storage/i18n";

export type DestinationState = {
  tone: "ok" | "warn" | "info";
  text: string;
  /** 有修复入口时给出主按钮文案，点击进入当前服务页 */
  fixLabel: string | null;
};

export function deriveDestinationState(
  input: {
    activeId: string;
    isLocal: boolean;
    configured: boolean;
    outcome: UploadOutcome | null;
    now: number;
  },
  language: StorageLocale & { failureText(error: unknown): string }
): DestinationState {
  const { t } = language;
  if (!input.isLocal && !input.configured) {
    return { tone: "warn", text: t("state.incomplete"), fixLabel: t("state.complete") };
  }
  // 换了上传位置后，旧位置的结果不再代表现在
  const outcome = input.outcome?.providerId === input.activeId ? input.outcome : null;
  if (outcome && !outcome.ok) {
    const fixLabel =
      outcome.kind === "auth"
        ? t("state.account")
        : outcome.kind === "location" || outcome.kind === "config"
          ? t("state.location")
          : null;
    return {
      tone: "warn",
      text: t("state.failed", { reason: language.failureText(outcome) }),
      fixLabel,
    };
  }
  if (outcome?.ok) {
    return {
      tone: "ok",
      text: t(input.isLocal ? "state.saved" : "state.uploaded", {
        time: formatRelativeTime(outcome.at, input.now, language),
      }),
      fixLabel: null,
    };
  }
  if (input.isLocal) {
    return { tone: "info", text: t("state.local"), fixLabel: null };
  }
  return { tone: "info", text: t("state.none"), fixLabel: null };
}
