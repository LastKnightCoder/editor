import { importTranslator } from "@/features/transfer/i18n-import";
/**
 * 批量导入的宿主接线：扫描 / 执行用到的真实命令、导入记录落账与整批撤销。
 * 写入限定在开始时的数据库，中途切库即中止（已写入部分照常记账，可撤销）。
 */

import { v4 as uuid } from "uuid";
import { createArticle, deleteArticle } from "@/commands/article";
import { createScopedCard, deleteScopedCard } from "@/commands/card";
import { replaceContent } from "@/commands/content";
import { getDataTableById, updateDataTable } from "@/commands/data-table";
import { createDatabaseItem, deleteDatabaseItem } from "@/commands/database-item";
import { getHomeDir, pathExists, resolvePathFrom } from "@/commands/file";
import {
  addChildProjectItem,
  addRootProjectItem,
  createProject,
  deleteProject,
} from "@/commands/project";
import { invoke } from "@/electron";
import { mimeTypeOf } from "@/utils/content-transfer/assets";
import { uploadResource } from "@/hooks/useUploadResource";
import { queryClient } from "@/queryClient";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
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
import type { DialectKey } from "@/utils/content-transfer/dialects";
import { openTransferSource, type TransferSource } from "@/utils/content-transfer/source";

const activeDatabase = () => useSettingStore.getState().setting.database.active;

const scanSource = async (
  source: TransferSource,
  onProgress?: (done: number, total: number) => void,
  dialect?: DialectKey
) => {
  const processor = await (await import("@/services/editorKit")).prepareContentMarkdown({});
  return scanImportSource(
    source,
    {
      pathExists,
      getHomeDir,
      resolvePathFrom,
      parseMarkdown: markdown => processor.importDocument(markdown, ["yaml"]),
    },
    onProgress,
    dialect
  );
};

export const scanImport = async (
  path: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  dialect?: DialectKey
): Promise<ImportPlan> => {
  const source = await openTransferSource(path, signal);
  const abort = () => {
    void source.close().catch(console.error);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    return await scanSource(source, onProgress, dialect);
  } catch (error) {
    await source.close();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
};

const refreshLists = () => {
  for (const key of ["cards", "articles", "projects", "databases"]) {
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
      upload: async (asset, signal) => {
        const { imageBed } = useSettingStore.getState().setting;
        if (imageBed.active === EImageBed.Local) {
          const compress = imageBed.enableCompression && /\.(jpe?g|png)$/i.test(asset.fileName);
          return invoke<string>(
            "import:copy",
            plan.source.session,
            asset.location,
            asset.fileName,
            compress
          );
        }
        const bytes = await invoke<Uint8Array<ArrayBuffer>>(
          "import:bytes",
          plan.source.session,
          asset.location
        );
        return uploadResource(
          new File([bytes], asset.fileName, { type: mimeTypeOf(asset.fileName) }),
          signal
        );
      },
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
      addProjectItem: async ({ projectId, parentItemId, title, content, contracts }) => {
        const input = {
          title,
          content,
          contracts,
          children: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: getContentLength(content),
          whiteboardContentId: 0,
        };
        const [, item] =
          parentItemId === undefined
            ? await addRootProjectItem(projectId, input)
            : await addChildProjectItem(parentItemId, input);
        if (!item) throw new Error(`创建文档失败：${title}`);
        return { id: item.id, contentId: item.contentId };
      },
      createArticle: async ({ title, content, contracts, tags }) => {
        const article = await createArticle({
          title,
          bannerBg: "",
          bannerPosition: "center",
          isTop: false,
          isDelete: false,
          author: "",
          content,
          contracts,
          tags,
          links: [],
          count: getContentLength(content),
        });
        return { id: article.id, contentId: article.contentId };
      },
      createCard: async ({ content, contracts, tags }) => {
        const card = await createScopedCard(database, {
          content,
          contracts,
          tags,
          count: getContentLength(content),
          isTop: false,
        });
        return { id: card.id, contentId: card.contentId };
      },
      replaceContent: (contentId, content) => replaceContent(contentId, { nodes: content }),
      createDatabase: async ({ title, headers, rows }) => {
        const item = await createDatabaseItem({ title });
        const table = await getDataTableById(item.dataTableId);
        // 沿用新表的默认主列 id，默认视图的列配置继续有效
        const primaryId = table.columns.find(column => column.isPrimary)?.id ?? uuid();
        const columns = headers.map((header, index) => ({
          id: index === 0 ? primaryId : uuid(),
          title: header,
          type: "text",
          width: 200,
          ...(index === 0 ? { isPrimary: true } : {}),
        }));
        await updateDataTable({
          id: table.id,
          columns,
          rows: rows.map(row => ({
            id: uuid(),
            ...Object.fromEntries(columns.map((column, index) => [column.id, row[index] ?? ""])),
          })),
          activeViewId: table.activeViewId,
        });
        return item.id;
      },
    },
    {
      ...hooks,
      beforeWrite: () => {
        if (activeDatabase() !== database) throw new Error("数据库已切换，导入已停止");
      },
    }
  );
  refreshLists();

  if (result.docCount === 0 && result.projectId === undefined && result.databaseIds.length === 0) {
    return { result };
  }
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
    databaseIds: result.databaseIds,
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
 * 整批撤销：删除本次导入建出的项目（连同文档树）/ 文章 / 卡片，以及 CSV 建出的数据库。
 * 导入后改过的内容一并删除；已上传的资源文件保留。已被删除的条目跳过。
 */
export const undoImport = async (record: ImportRecord) => {
  if (record.database !== activeDatabase()) {
    throw new Error(importTranslator.t("undo.wrongDatabase"));
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
  for (const id of record.databaseIds ?? []) {
    await deleteDatabaseItem(id).catch(error =>
      console.warn(`撤销导入时删除数据库失败（${id}）:`, error)
    );
  }
  useImportHistoryStore.getState().remove(record.id);
  refreshLists();
};
