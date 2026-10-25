/** 伴读库的动作与格式化：打开原网页 / Tau 卡片、时间显示与分组 */
import {
  COMPANION_METHODS,
  WEB_HIGHLIGHT_HASH,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import { toast } from "@tau/ui";
import { callBackground } from "../shared/extension-page";

/** 打开原网页；带标注 id 时伴读滚到那条标注 */
export const openPage = (url: string, annotationId?: string) =>
  void chrome.tabs.create({
    url: annotationId ? `${url}#${WEB_HIGHLIGHT_HASH}=${encodeURIComponent(annotationId)}` : url,
  });

export const openCard = (cardId: number) =>
  void callBackground(COMPANION_METHODS.noteOpen, { cardId })
    .then(() => toast.success("已在 Tau 中打开"))
    .catch(() => toast.error("Tau 未连接"));

const DAY = 86_400_000;
const startOfToday = () => new Date().setHours(0, 0, 0, 0);

export function formatTime(time: number): string {
  const date = new Date(time);
  const today = startOfToday();
  if (time >= today)
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (time >= today - DAY) return "昨天";
  if (date.getFullYear() === new Date().getFullYear())
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.toLocaleDateString("zh-CN");
}

/** 页面列表按时间排序时的分组 */
export function timeGroup(time: number): string {
  const today = startOfToday();
  if (time >= today) return "今天";
  if (time >= today - DAY) return "昨天";
  if (time >= today - 6 * DAY) return "本周";
  if (time >= today - 29 * DAY) return "本月";
  return "更早";
}

/** 没有标题的页面用「域名 + 路径」代替完整网址 */
export function readableUrl(url: string): string {
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
