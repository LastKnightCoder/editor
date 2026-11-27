import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/board.zh-CN.json";
import zhTW from "./locales/board.zh-TW.json";
import enUS from "./locales/board.en-US.json";
export const composeBoardMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const composeBoardTranslator = desktopI18n.get(composeBoardMessages);
export type ComposeBoardTranslate = Translator<Parameters<typeof composeBoardMessages.ref>[0]>["t"];
export function useComposeBoardI18n() {
  return useI18n(composeBoardMessages, desktopI18n);
}
export function composeBoardFeedback(
  key: Parameters<ComposeBoardTranslate>[0],
  values?: TranslationValues
) {
  const params = values && Object.freeze({ ...values });
  const getMessage = () => composeBoardTranslator.t(key, params);
  return [getMessage(), { getMessage }] as const;
}
export function composeGatherFailure(error: unknown) {
  const raw = error instanceof Error ? error.message : undefined;
  const getMessage = () => raw ?? composeBoardTranslator.t("board.gatherFailed");
  return [getMessage(), { getMessage }] as const;
}
