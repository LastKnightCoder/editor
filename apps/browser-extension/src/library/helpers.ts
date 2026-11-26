/** 伴读库的动作与格式化：打开原网页 / Tau 卡片、时间显示与分组 */
import {
  COMPANION_METHODS,
  WEB_HIGHLIGHT_HASH,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import { toast } from "@tau/ui";
import { callBackground } from "../shared/extension-page";
import { libraryTranslator, type LibraryLocale } from "./i18n";

/** 打开原网页；带标注 id 时伴读滚到那条标注 */
export const openPage = (url: string, annotationId?: string) =>
  void chrome.tabs.create({
    url: annotationId ? `${url}#${WEB_HIGHLIGHT_HASH}=${encodeURIComponent(annotationId)}` : url,
  });

export const openCard = (cardId: number) =>
  void callBackground(COMPANION_METHODS.noteOpen, { cardId })
    .then(() => toast.success(libraryTranslator.t("opened")))
    .catch(() => toast.error(libraryTranslator.t("disconnected")));

const DAY = 86_400_000;
const startOfToday = (now: number) => new Date(now).setHours(0, 0, 0, 0);

export function formatTime(time: number, { locale, t }: LibraryLocale, now = Date.now()): string {
  const date = new Date(time);
  const today = startOfToday(now);
  if (time >= today)
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (time >= today - DAY) return t("time.yesterday");
  if (date.getFullYear() === new Date(now).getFullYear())
    return date.toLocaleDateString(locale, { month: "long", day: "numeric" });
  return date.toLocaleDateString(locale);
}

/** 页面列表按时间排序时的分组 */
export function timeGroup(
  time: number,
  now = Date.now()
): "today" | "yesterday" | "week" | "month" | "older" {
  const today = startOfToday(now);
  if (time >= today) return "today";
  if (time >= today - DAY) return "yesterday";
  if (time >= today - 6 * DAY) return "week";
  if (time >= today - 29 * DAY) return "month";
  return "older";
}

/** 没有标题的页面用「域名 + 路径」代替完整网址 */
function readableUrl(url: string): string {
  try {
    const { host, pathname, search } = new URL(url);
    const path = decodeURI(pathname).replace(/\/$/, "");
    return `${host.replace(/^www\./, "")}${path}${search}`;
  } catch {
    return url;
  }
}

export const pageLabel = (page: Pick<WebPageSummary, "title" | "url">) =>
  page.title || readableUrl(page.url);
