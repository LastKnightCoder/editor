import dayjs from "dayjs";
import type { Comment as CommentType } from "../../../types";

const getTotalCommentCount = (items: CommentType[] = []): number => {
  return items.reduce((total, comment) => {
    const replies = comment.replies?.length ? getTotalCommentCount(comment.replies) : 0;
    return total + 1 + replies;
  }, 0);
};

/** 批注时间：今天 / 昨天只写时刻，本年省略年份 */
const formatCommentTime = (timestamp: number, now: number = Date.now()): string => {
  const time = dayjs(timestamp);
  const today = dayjs(now);
  if (time.isSame(today, "day")) return `今天 ${time.format("HH:mm")}`;
  if (time.isSame(today.subtract(1, "day"), "day")) return `昨天 ${time.format("HH:mm")}`;
  if (time.isSame(today, "year")) return time.format("M月D日 HH:mm");
  return time.format("YYYY年M月D日");
};

/** 更新时间比创建晚过一分钟才算「已编辑」，免得创建时的同帧写入误判 */
const isCommentEdited = (comment: CommentType): boolean =>
  comment.updateTime - comment.createTime > 60_000;

export { getTotalCommentCount, formatCommentTime, isCommentEdited };
