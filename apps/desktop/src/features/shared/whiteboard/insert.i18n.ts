import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { entityDisplayTime } from "@/components/EntityPicker/format";
import type { MaterialNote } from "./components/Document/insert";
import zhCN from "./locales/insert.zh-CN.json";
import zhTW from "./locales/insert.zh-TW.json";
import enUS from "./locales/insert.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const documentInsertTranslator = desktopI18n.get(messages);
export function useDocumentInsertI18n() {
  return useI18n(messages, desktopI18n);
}
export function materialNoteText(
  note: MaterialNote,
  context: Pick<ReturnType<typeof useDocumentInsertI18n>, "t" | "locale">
): string {
  return note.kind === "related"
    ? context.t(`reason.${note.reasonKind}`)
    : [note.meta, entityDisplayTime(note.time, context.locale, note.now)]
        .filter(Boolean)
        .join(" · ");
}
