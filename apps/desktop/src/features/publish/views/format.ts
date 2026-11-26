import type { PublishExecutionTranslate } from "../execution.messages";
/** 发布页时间文案：耗时。 */

export function formatDuration(ms: number, t: PublishExecutionTranslate): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return t("duration.seconds", { count: s });
  return t("duration.minutes", { minutes: Math.floor(s / 60), seconds: s % 60 });
}
