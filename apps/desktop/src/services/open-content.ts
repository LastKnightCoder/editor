import { getProjectItemById } from "@/commands/project";
import { getDocumentItem, openDocumentItemInNewWindow } from "@/commands/document";
import useSettingStore from "@/stores/useSettingStore";
import { getPageNavigation, openPage } from "./page-navigation";

export async function openContent(type: string, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("内容 ID 无效");
  const database = useSettingStore.getState().setting.database.active;
  const ensureDatabase = () => {
    if (useSettingStore.getState().setting.database.active !== database) {
      throw new Error("数据库已切换，请重新打开内容");
    }
  };
  if (type === "card" || type === "article") {
    openPage(type === "card" ? "card-detail" : "article-detail", { id });
    return;
  }
  if (type === "project-item") {
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
    openPage("project-detail", { id: projectId, itemId: id });
    return;
  }
  if (type === "document-item") {
    const item = await getDocumentItem(id);
    ensureDatabase();
    if (!item) throw new Error("知识库文档不存在");
    await openDocumentItemInNewWindow(database, id);
    return;
  }
  throw new Error(`暂不支持打开此内容类型：${type}`);
}
