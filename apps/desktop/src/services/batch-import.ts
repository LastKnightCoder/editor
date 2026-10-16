/**
 * 批量导入的宿主接线：扫描 / 执行用到的真实命令、导入记录落账与整批撤销。
 * 写入限定在开始时的数据库，中途切库即中止（已写入部分照常记账，可撤销）。
 */

import { v4 as uuid } from "uuid";
import { createArticle, deleteArticle } from "@/commands/article";
import { createScopedCard, deleteScopedCard } from "@/commands/card";
import { updateContent } from "@/commands/content";
import { getHomeDir, pathExists, readBinaryFile, resolvePathFrom } from "@/commands/file";
import {
  addChildProjectItem,
  addRootProjectItem,
  createProject,
  deleteProject,
} from "@/commands/project";
import { uploadResource } from "@/hooks/useUploadResource";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import { useImportHistoryStore, type ImportRecord } from "@/stores/useImportHistoryStore";
import { EProjectItemType } from "@/types";
import { getContentLength } from "@/utils/helper";
import {
  runImport,
  scanImportSource,
  type ImportHooks,
  type ImportOptions,
  type ImportPlan,
  type ImportResult,
} from "@/utils/content-transfer/batch-import";
import { openTransferSource } from "@/utils/content-transfer/source";

const activeDatabase = () => useSettingStore.getState().setting.database.active;

export const scanImport = async (
  path: string,
  onProgress?: (done: number, total: number) => void
): Promise<ImportPlan> => {
  const source = await openTransferSource(path);
  return scanImportSource(source, { pathExists, getHomeDir, resolvePathFrom }, onProgress);
};

const refreshLists = () => {
  for (const key of ["cards", "articles", "projects"]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
};

/** 执行导入并记账；返回结果与记录 id（没有写入任何内容时不记账） */
export const executeImport = async (
  plan: ImportPlan,
  options: ImportOptions,
  hooks: Omit<ImportHooks, "beforeWrite"> = {}
): Promise<{ result: ImportResult; recordId?: string }> => {
  const database = activeDatabase();
  const result = await runImport(
    plan,
    options,
    {
      readDiskBytes: readBinaryFile,
      upload: uploadResource,
      createProject: async title => {
        const project = await createProject({
          title,
          desc: [],
          children: [],
          archived: false,
          pinned: false,
        });
        return project.id;
      },
      addProjectItem: async ({ projectId, parentItemId, title, content }) => {
        const input = {
          title,
          content,
          children: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: getContentLength(content),
          whiteBoardContentId: 0,
        };
        const [, item] =
          parentItemId === undefined
            ? await addRootProjectItem(projectId, input)
            : await addChildProjectItem(parentItemId, input);
        if (!item) throw new Error(`创建文档失败：${title}`);
        return { id: item.id, contentId: item.contentId };
      },
      createArticle: async ({ title, content, tags }) => {
        const article = await createArticle({
          title,
          bannerBg: "",
          bannerPosition: "center",
          isTop: false,
          isDelete: false,
          author: "",
          content,
          tags,
          links: [],
          count: getContentLength(content),
        });
        return { id: article.id, contentId: article.contentId };
      },
      createCard: async ({ content, tags }) => {
        const card = await createScopedCard(database, {
          content,
          tags,
          count: getContentLength(content),
          isTop: false,
        });
        return { id: card.id, contentId: card.contentId };
      },
      updateContent: (contentId, content) => updateContent(contentId, content),
    },
    {
      ...hooks,
      beforeWrite: () => {
        if (activeDatabase() !== database) throw new Error("数据库已切换，导入已停止");
      },
    }
  );
  refreshLists();

  if (result.docCount === 0 && result.projectId === undefined) return { result };
  const record: ImportRecord = {
    id: uuid(),
    database,
    at: Date.now(),
    sourceName: plan.source.name,
    sourcePath: plan.source.rootPath,
    target: result.target,
    projectId: result.projectId,
    projectTitle: result.target === "project" ? options.projectTitle : undefined,
    entityIds: result.entityIds,
    docCount: result.docCount,
    assetCount: result.assetCount,
    linkCount: result.linkCount,
    warnings: result.warnings,
    stopped: result.stopped,
  };
  useImportHistoryStore.getState().add(record);
  return { result, recordId: record.id };
};

/**
 * 整批撤销：删除本次导入建出的项目（连同文档树）/ 文章 / 卡片。
 * 导入后改过的内容一并删除；已上传的资源文件保留。已被删除的条目跳过。
 */
export const undoImport = async (record: ImportRecord) => {
  if (record.database !== activeDatabase()) {
    throw new Error("这条记录属于其它数据库，请先切换过去");
  }
  if (record.target === "project" && record.projectId !== undefined) {
    await deleteProject(record.projectId);
  } else {
    for (const id of record.entityIds) {
      try {
        if (record.target === "article") await deleteArticle(id);
        else await deleteScopedCard(record.database, id);
      } catch (error) {
        console.warn(`撤销导入时删除失败（${record.target} ${id}）:`, error);
      }
    }
  }
  useImportHistoryStore.getState().remove(record.id);
  refreshLists();
};
