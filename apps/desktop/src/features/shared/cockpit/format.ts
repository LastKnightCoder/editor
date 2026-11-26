import type { Translator } from "@tau/i18n";
import { formatRelativeTime } from "../list/format";
import type { CockpitItem } from "./types";
import type { CockpitSort } from "./model";
import type { CockpitMessageKey } from "./i18n";
type Language = { locale: string; t: Translator<CockpitMessageKey>["t"] };

export function formatDate(ts: number, locale: string, now = Date.now()): string {
  const date = new Date(ts);
  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
export function formatOpenedAt(ts: number, language: Language, now = Date.now()): string {
  const start = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.floor((start(now) - start(ts)) / 86_400_000);
  const day = formatRelativeTime(ts, language.locale, now);
  return days <= 1
    ? language.t("time.day", {
        day,
        time: new Intl.DateTimeFormat(language.locale, {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(ts),
      })
    : day;
}
export function cockpitTimeMeta(
  item: CockpitItem,
  sort: CockpitSort,
  language: Language,
  now = Date.now()
): string {
  if (sort === "created")
    return language.t("time.created", { date: formatDate(item.createTime, language.locale, now) });
  if (sort === "opened" && item.openedAt !== null)
    return language.t("time.opened", {
      date: formatRelativeTime(item.openedAt, language.locale, now),
    });
  return language.t("time.updated", {
    date: formatRelativeTime(item.updateTime, language.locale, now),
  });
}
