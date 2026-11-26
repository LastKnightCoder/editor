import { defineI18n } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import { splitRemoteError } from "@/services/whiteboard-documents/remote";
import zhCN from "./locales/remote-errors.zh-CN.json";
import zhTW from "./locales/remote-errors.zh-TW.json";
import enUS from "./locales/remote-errors.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function remoteFailureText(error: unknown): string {
  const { code, message } = splitRemoteError(error);
  const t = desktopI18n.get(messages).t;
  switch (code) {
    case "OFFLINE":
      return t("offline");
    case "FORBIDDEN":
      return t("forbidden");
    case "CLIENT_UPGRADE_REQUIRED":
      return t("upgrade");
    case "DURABLE_DOCUMENT_UNSAVED":
      return t("unsaved", { reason: message });
    case "DURABLE_DOCUMENT_FAILED":
      return t("failed", { reason: message });
    default:
      return message;
  }
}
