import { resolveLocale } from "@tau/i18n";

export const APP_LANGUAGES = [
  { locale: "zh-CN", label: "简体中文" },
  { locale: "zh-TW", label: "繁體中文" },
  { locale: "en-US", label: "English" },
] as const;
export type LanguagePreference = "system" | (typeof APP_LANGUAGES)[number]["locale"];

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === "system" || APP_LANGUAGES.some(item => item.locale === value)
    ? (value as LanguagePreference)
    : "zh-CN";
}

export function resolveAppLocale(preference: unknown, systemLocale: string): string {
  const language = normalizeLanguagePreference(preference);
  try {
    return resolveLocale(
      language === "system" ? systemLocale : language,
      APP_LANGUAGES.map(item => item.locale),
      "zh-CN"
    );
  } catch {
    return "zh-CN";
  }
}
