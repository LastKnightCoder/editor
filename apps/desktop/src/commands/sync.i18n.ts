import { defineI18n } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/sync.zh-CN.json";
import zhTW from "./locales/sync.zh-TW.json";
import enUS from "./locales/sync.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const syncCommandTranslator = desktopI18n.get(messages);
export class SyncCommandError extends Error {
  readonly code = "DATABASE_SYNC_FAILURE";
  constructor(
    readonly messageKey: Parameters<typeof messages.ref>[0],
    message: string
  ) {
    super(message);
    this.name = "SyncCommandError";
  }
}
export function syncCommandErrorText(error: unknown): string {
  return error instanceof SyncCommandError
    ? syncCommandTranslator.t(error.messageKey)
    : error instanceof Error
      ? error.message
      : String(error);
}
