import dayjs from "dayjs";
import { type Comment as CommentType } from "../types.ts";

const getTotalCommentCount = (items: CommentType[] = []): number => {
  return items.reduce((total, comment) => {
    const replies = comment.replies?.length ? getTotalCommentCount(comment.replies) : 0;
    return total + 1 + replies;
  }, 0);
};

/** 批注时间：今天 / 昨天只写时刻，本年省略年份 */
const formatCommentTime = (
  timestamp: number,
  locale: string,
  relative: (day: "today" | "yesterday", time: string) => string,
  now: number = Date.now()
): string => {
  const time = dayjs(timestamp);
  const today = dayjs(now);
  const clock = () =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(timestamp);
  if (time.isSame(today, "day")) return relative("today", clock());
  if (time.isSame(today.subtract(1, "day"), "day")) return relative("yesterday", clock());
  const sameYear = time.isSame(today, "year");
  return new Intl.DateTimeFormat(locale, {
    year: sameYear ? undefined : "numeric",
    month: "long",
    day: "numeric",
    hour: sameYear ? "2-digit" : undefined,
    minute: sameYear ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(timestamp);
};

/** 更新时间比创建晚过一分钟才算「已编辑」，免得创建时的同帧写入误判 */
const isCommentEdited = (comment: CommentType): boolean =>
  comment.updateTime - comment.createTime > 60_000;

export { getTotalCommentCount, formatCommentTime, isCommentEdited };
