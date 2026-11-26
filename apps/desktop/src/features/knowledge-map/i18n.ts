import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import type { KnowledgeMapItem } from "@/knowledge-map/types";
import type { MapItemKind } from "./model";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const knowledgeMapMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const knowledgeMapTranslator = desktopI18n.get(knowledgeMapMessages);
export type MapTranslate = Translator<Parameters<typeof knowledgeMapMessages.ref>[0]>["t"];
export function useKnowledgeMapI18n() {
  return useI18n(knowledgeMapMessages, desktopI18n);
}
export function mapKindLabel(kind: MapItemKind, t: MapTranslate): string {
  return t(`map.kind.${kind}`);
}
export function mapPlaceLabel(item: KnowledgeMapItem, t: MapTranslate): string {
  const kind = mapKindLabel(item.kind, t);
  return item.kind === "project-item" && item.projectTitle
    ? `${kind} · ${item.projectTitle}`
    : kind;
}
