import { getDiaryEntryById } from "@/commands/diary";
import { getProjectItemById } from "@/commands/project";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import useSettingStore from "@/stores/useSettingStore";
import { normalizeDiaryDay } from "@/utils/diary-day";
import { getPageNavigation, openPage } from "./page-navigation";
import { serializeEntityLocation, type EntityLocation } from "@/entity/locate";

/** 打开一个实体对应的 Page；异步查询期间切库则放弃导航 */
export async function openEntity(
  ref: EntityRef,
  options: { at?: EntityLocation; momentId?: number } = {}
) {
  const position = options.at ? { at: serializeEntityLocation(options.at) } : {};
  const { kind, id } = ref;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("内容 ID 无效");
  const database = useSettingStore.getState().setting.database.active;
  const ensureDatabase = () => {
    if (useSettingStore.getState().setting.database.active !== database) {
      throw new Error("数据库已切换，请重新打开内容");
    }
  };
  switch (kind) {
    case "card":
      openPage("card-detail", { id, ...position });
      return;
    case "article":
      openPage("article-detail", { id, ...position });
      return;
    case "project-item": {
      const current = getPageNavigation().navigator.current();
      const item = await getProjectItemById(id);
      ensureDatabase();
      if (!item?.projects.length) throw new Error("项目文档不存在或未归属项目");
      const currentProjectId =
        current?.key === "project-detail" ? Number(current.params.id) : undefined;
      const projectId =
        currentProjectId && item.projects.includes(currentProjectId)
          ? currentProjectId
          : item.projects[0];
      openPage("project-detail", { id: projectId, itemId: id, ...position });
      return;
    }
    case "diary": {
      const entry = await getDiaryEntryById(id);
      ensureDatabase();
      if (!entry?.date) throw new Error("日记不存在");
      // 旧 weekly / monthly 条目的 date 是 YYYY-Www / YYYY-MM，日记页按归属日定位
      openPage("diary", {
        date: normalizeDiaryDay(entry.date, entry.createTime),
        ...(options.momentId != null ? { moment: String(options.momentId), ...position } : {}),
      });
      return;
    }
  }
}

/** 按存量类型写法（card / article / project-item / diary-daily 等）打开内容 */
export async function openContent(type: string, id: number) {
  const kind = normalizeEntityRefKind(type);
  if (!kind) throw new Error(`暂不支持打开此内容类型：${type}`);
  await openEntity({ kind, id });
}
