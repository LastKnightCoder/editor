import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const contextTranslator = mobileI18n.get(messages);
export function useContextI18n() {
  return useI18n(messages, mobileI18n);
}
const KINDS = [
  "card",
  "article",
  "project-item",
  "diary-moment",
  "plugin-entity",
  "chat-session",
  "vl-note",
  "excerpt",
  "pdf-annotation",
  "web-clip",
  "flashcard",
  "vl-project",
  "todo",
  "notebook",
] as const;
type ContextKind = (typeof KINDS)[number];
function isContextKind(kind: string): kind is ContextKind {
  return (KINDS as readonly string[]).includes(kind);
}
export function contextKindLabel(
  kind: string,
  { t }: Pick<ReturnType<typeof useContextI18n>, "t">
): string {
  return isContextKind(kind) ? t(`kind.${kind}`) : kind;
}
