import { APP_LANGUAGES, resolveAppLocale } from "@tau/shared/language";
import type { ConnectionStatus } from "./messages";
export function browserUiLanguage(): string {
  try {
    return globalThis.chrome?.i18n?.getUILanguage() || globalThis.navigator?.language || "zh-CN";
  } catch {
    return globalThis.navigator?.language || "zh-CN";
  }
}
export function resolveExtensionLocale(
  status: ConnectionStatus,
  browserLanguage = browserUiLanguage()
): string {
  const host = status.appearance?.locale;
  if (
    status.state === "ready" &&
    typeof host === "string" &&
    APP_LANGUAGES.some(item => item.locale === host)
  )
    return host;
  return resolveAppLocale("system", browserLanguage);
}
