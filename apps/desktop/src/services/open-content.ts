import { getDiaryMoment } from "@/commands/diary";
import { getProjectItemById } from "@/commands/project";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import useSettingStore from "@/stores/useSettingStore";
import { normalizeDiaryDay } from "@/utils/diary-day";
import { getPageNavigation, openPage } from "./page-navigation";
import { serializeEntityLocation, type EntityLocation } from "@/entity/locate";
import { locatePluginEntity } from "@/commands/plugin-entities";
import { PLUGIN_ENTITY_PAGE_KEY, pluginEntityKind } from "./plugin-entity-kinds";

/** 打开一个实体对应的 Page；异步查询期间切库则放弃导航 */
export async function openEntity(
  ref: EntityRef,
  options: { at?: EntityLocation; compose?: boolean } = {}
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
      openPage("article-detail", {
        id,
        ...position,
        ...(options.compose ? { layout: "compose" } : {}),
      });
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
      openPage("project-detail", {
        id: projectId,
        itemId: id,
        ...position,
        ...(options.compose ? { layout: "compose" } : {}),
      });
      return;
    }
    case "diary-moment": {
      const moment = await getDiaryMoment(id);
      ensureDatabase();
      if (!moment) throw new Error("碎碎念不存在");
      openPage("diary", {
        date: normalizeDiaryDay(moment.entryDate, moment.createTime),
        moment: String(moment.id),
        ...position,
      });
      return;
    }
    case "plugin-entity": {
      const entity = await locatePluginEntity(database, id);
      ensureDatabase();
      if (!entity) throw new Error("内容不存在");
      // 插件在运行就进入插件声明的页面，否则打开宿主的只读页
      const kind = pluginEntityKind(entity.pluginId, entity.kind);
      if (kind) return kind.open(entity, position.at);
      openPage(PLUGIN_ENTITY_PAGE_KEY, { id, ...position });
      return;
    }
  }
}

/** 按正文实体类型打开内容 */
export async function openContent(type: string, id: number) {
  const kind = normalizeEntityRefKind(type);
  if (!kind) throw new Error(`暂不支持打开此内容类型：${type}`);
  await openEntity({ kind, id });
}
