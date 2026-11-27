import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/selection.zh-CN.json";
import zhTW from "./locales/selection.zh-TW.json";
import enUS from "./locales/selection.en-US.json";
export const publishSelectionMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type PublishSelectionKey = Parameters<typeof publishSelectionMessages.ref>[0];
export const publishSelectionTranslator = desktopI18n.get(publishSelectionMessages);
export function usePublishSelectionI18n() {
  return useI18n(publishSelectionMessages, desktopI18n);
}

export function selectionSearchText({
  type,
  id,
  title,
  description,
}: {
  type: "card" | "article" | "project";
  id: number;
  title: string;
  description?: string;
}): string {
  const fallback = publishSelectionMessages.resources[publishSelectionMessages.fallbackLocale];
  return Object.values(publishSelectionMessages.resources)
    .flatMap(resource => [
      ...(!title
        ? [
            (resource[`${type}.untitled`] ?? fallback[`${type}.untitled`]).replaceAll(
              "{{id}}",
              String(id)
            ),
          ]
        : []),
      ...(description === "" ? [resource["content.empty"] ?? fallback["content.empty"]] : []),
    ])
    .join("\n");
}
