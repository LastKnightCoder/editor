/**
 * 回到原内容：当前数据库内进对应详情页；原内容在其它数据库时开独立窗口（仅 Electron，
 * Web 端不渲染该入口——PREFERENCES「平台能力分层渲染」）。
 */

import type { SourceBinding } from "@tau/collaboration";
import { isElectron } from "@/electron";
import { openArticleInNewWindow } from "@/commands/article";
import { openCardInNewWindow } from "@/commands/card";
import { openProjectItemInNewWindow } from "@/commands/project";
import { openContent } from "@/services/open-content";
import useSettingStore from "@/stores/useSettingStore";

export function isOtherDatabase(source: SourceBinding): boolean {
  return useSettingStore.getState().setting.database.active !== source.databaseName;
}

/** 其它数据库的内容只在 Electron 下可达 */
export function canOpenSource(source: SourceBinding): boolean {
  return !isOtherDatabase(source) || isElectron;
}

export async function openSource(source: SourceBinding): Promise<void> {
  const id = source.sourceId;
  if (!id) throw new Error("原内容不存在");
  if (isOtherDatabase(source)) {
    if (source.sourceType === "article")
      return void (await openArticleInNewWindow(source.databaseName, id));
    if (source.sourceType === "card")
      return void (await openCardInNewWindow(source.databaseName, id));
    if (source.sourceType === "project-item")
      return void (await openProjectItemInNewWindow(source.databaseName, id));
    throw new Error("暂不支持打开此内容类型");
  }
  await openContent(source.sourceType ?? "content", id);
}
