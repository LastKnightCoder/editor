import type { Navigator } from "../../router/navigatorTypes";
import type { MobileEntityOpenOptions, MobileEntityOpenTarget } from "./app-types";
import {
  describeDiaryPeriod,
  getBaseDateFromDiaryKey,
  getDiaryDateKey,
} from "../../features/diary/dateKey";

function positiveId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("内容打开目标无效");
  return value;
}

export function navigateMobileEntity(
  navigator: Pick<Navigator, "push">,
  target: MobileEntityOpenTarget,
  options: MobileEntityOpenOptions
): void {
  if (options.placement !== "page") throw new Error("移动端只支持在当前应用页面打开内容");
  if (options.at !== undefined && !["card", "article", "document", "diary"].includes(target.kind))
    throw new Error("这类内容不支持按正文块序号定位");
  if (options.at && (!Number.isSafeInteger(options.at.block) || options.at.block < 0))
    throw new Error("正文块序号必须是非负整数");
  const location = options.at
    ? { block: options.at.block, locationRequestId: crypto.randomUUID() }
    : {};
  switch (target.kind) {
    case "diary": {
      positiveId(target.id);
      if (
        !["daily", "weekly", "monthly"].includes(target.diaryType) ||
        typeof target.date !== "string"
      )
        throw new Error("日记日期无效");
      const baseDate = getBaseDateFromDiaryKey(target.diaryType, target.date);
      if (getDiaryDateKey(target.diaryType, baseDate) !== target.date)
        throw new Error("日记日期无效");
      navigator.push("contentDetail", {
        contentId: positiveId(target.contentId),
        contentTitle: "",
        fromDiary: true,
        diaryDate: describeDiaryPeriod(target.diaryType, baseDate),
        ...location,
      });
      return;
    }
    case "card":
      navigator.push("contentDetail", { cardId: positiveId(target.id), ...location });
      return;
    case "article":
      navigator.push("articleEditor", { articleId: positiveId(target.id), ...location });
      return;
    case "document":
      navigator.push("projectDocEditor", {
        itemId: positiveId(target.id),
        projectTitle: "",
        ...location,
      });
      return;
    case "project":
      navigator.push("projectDetail", { projectId: positiveId(target.id) });
      return;
    case "todo":
      navigator.push("todoDetail", {
        todoId: positiveId(target.id),
        groupId: positiveId(target.groupId),
      });
      return;
    case "event":
      navigator.push("calendarEventDetail", { eventId: positiveId(target.id) });
      return;
    case "document-task":
      if (typeof target.taskId !== "string" || !target.taskId)
        throw new Error("正文待办打开目标无效");
      navigator.push("contentDetail", {
        contentId: positiveId(target.contentId),
        taskId: target.taskId,
      });
      return;
    default:
      throw new Error("移动端尚未支持打开这类内容");
  }
}
