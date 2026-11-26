import { desktopLocaleSource } from "@/app/i18n/runtime";
import { homeTranslator } from "./i18n";

export function minutesToHM(minutes: number): string {
  const format = new Intl.NumberFormat(desktopLocaleSource.getSnapshot());
  if (minutes < 60) return homeTranslator.t("duration.minutes", { value: format.format(minutes) });
  const hours = Math.floor(minutes / 60);
  return hours >= 10
    ? homeTranslator.t("duration.hours", { value: format.format(hours) })
    : homeTranslator.t("duration.hoursMinutes", {
        hours: format.format(hours),
        minutes: format.format(minutes % 60),
      });
}
