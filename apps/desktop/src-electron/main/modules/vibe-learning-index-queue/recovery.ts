import log from "electron-log";
import databaseModule from "../database";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import vibeLearningDBManager from "../vibe-learning-db";
import { isOnlineVideoSourceType } from "@/types/vibe-learning";
import { onlineVideoRef } from "@/types/online-video";
import { getOnlineVideoCacheStatus } from "../online-video-cache";
import { yieldEvery, yieldToEventLoop } from "../../utils/event-loop-yield";
import type { VibeLearningIndexQueue } from "./index";
import type { RecoverResourcesOptions } from "./types";
import { checkMarkdownExists } from "./markdown-store";

const RECOVER_YIELD_EVERY = 10;

export async function checkAndRecoverResources(
  manager: VibeLearningIndexQueue,
  mainDbName: string,
  options: RecoverResourcesOptions = {}
): Promise<void> {
  log.info(`[VibeLearningIndexQueue] Checking resources for database: ${mainDbName}`);

  try {
    const db = databaseModule.getDatabase(mainDbName);

    if (!db) {
      log.warn("[VibeLearningIndexQueue] No database connection");
      return;
    }

    // 检查是否有 vibe_learning_resources 表
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_resources'"
      )
      .get();

    if (!tableExists) {
      log.info("[VibeLearningIndexQueue] vibe_learning_resources table not found, skipping");
      return;
    }

    // 获取所有资源
    const allResources = VibeLearningResourceTable.getAllResources(db);

    log.info(`[VibeLearningIndexQueue] Found ${allResources.length} resources to check`);

    const forceEmbedding = options.forceEmbedding === true;
    let processed = 0;

    for (const resource of allResources) {
      // 检查状态
      const status = await manager.computeResourceStatus(resource, mainDbName, {
        forceEmbedding,
      });

      if (status === "pending" || status === "need_convert" || status === "need_download") {
        // 需要完整处理（对于在线视频，full 任务会自动处理下载）
        const result = manager.addTask({
          resourceId: resource.id,
          projectId: resource.projectId,
          mainDbName,
          originalPath: resource.originalPath,
          resourceName: resource.name,
          type: "full",
        });
        if (result.accepted) {
          log.info(
            `[VibeLearningIndexQueue] Added full task for resource ${resource.id} (status: ${status}, sourceType: ${resource.sourceType || "local"})`
          );
        } else {
          log.info(
            `[VibeLearningIndexQueue] Skip full task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
          );
        }
      } else if (status === "need_index") {
        // 只需要索引
        const result = manager.addTask({
          resourceId: resource.id,
          projectId: resource.projectId,
          mainDbName,
          originalPath: resource.originalPath,
          resourceName: resource.name,
          markdownPath: resource.markdownPath || undefined,
          type: "index_only",
        });
        if (result.accepted) {
          log.info(`[VibeLearningIndexQueue] Added index_only task for resource ${resource.id}`);
        } else {
          log.info(
            `[VibeLearningIndexQueue] Skip index_only task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
          );
        }
      } else if (status === "need_embedding") {
        // 只需要生成 embedding
        const result = manager.addTask({
          resourceId: resource.id,
          projectId: resource.projectId,
          mainDbName,
          originalPath: resource.originalPath,
          resourceName: resource.name,
          markdownPath: resource.markdownPath || undefined,
          type: "embedding_only",
        });
        if (result.accepted) {
          log.info(
            `[VibeLearningIndexQueue] Added embedding_only task for resource ${resource.id}`
          );
        } else {
          log.info(
            `[VibeLearningIndexQueue] Skip embedding_only task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
          );
        }
      }
      processed += 1;
      await yieldEvery(processed, RECOVER_YIELD_EVERY);
    }
    await yieldToEventLoop();
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error checking resources: ${error}`);
  }
}

/**
 * 计算资源状态
 */
export async function computeResourceStatus(
  manager: VibeLearningIndexQueue,
  resource: {
    id: number;
    projectId: number;
    markdownPath: string | null;
    originalPath?: string;
    sourceType?: string | null;
    sourceMetaInfo?: string | null;
  },
  mainDbName: string,
  options: RecoverResourcesOptions = {}
): Promise<string> {
  // 检查是否在处理队列中
  const queueStatus = manager.getResourceStatus(resource.id);
  if (queueStatus) {
    return queueStatus;
  }

  // 在线视频没有转写结果且未缓存时，需要完整处理（下载 + 转录 + 索引）
  if (
    resource.sourceType &&
    isOnlineVideoSourceType(resource.sourceType) &&
    resource.sourceMetaInfo &&
    !resource.markdownPath
  ) {
    const { sourceType, sourceMetaInfo } = resource;
    const cached = await Promise.resolve()
      .then(() =>
        getOnlineVideoCacheStatus({
          providerId: sourceType,
          ref: onlineVideoRef(JSON.parse(sourceMetaInfo) as Record<string, unknown>),
        })
      )
      .catch(error => {
        log.warn(
          `[VibeLearningIndexQueue] Failed to check online video cache for resource ${resource.id}: ${error}`
        );
        return null;
      });
    if (!cached) return "need_download";
  }

  // 检查是否有 markdown_path
  if (!resource.markdownPath) {
    return "pending";
  }

  // 检查 Markdown 文件是否存在
  const mdExists = await checkMarkdownExists(resource.markdownPath);
  if (!mdExists) {
    return "need_convert";
  }

  // 检查 FTS 索引是否存在
  const ftsIndexExists = vibeLearningDBManager.checkIndexExists(
    mainDbName,
    resource.projectId,
    resource.id
  );
  if (!ftsIndexExists) {
    return "need_index";
  }

  if (options.forceEmbedding) {
    return "need_embedding";
  }

  // 如果配置了 embedding，检查向量索引是否存在
  const embeddingConfig = await manager.getEmbeddingConfig();
  if (embeddingConfig) {
    const vecIndexExists = vibeLearningDBManager.checkVecIndexExists(
      mainDbName,
      resource.projectId,
      resource.id
    );
    if (!vecIndexExists) {
      return "need_embedding";
    }
  }

  return "completed";
}

export async function reinitAllVecTables(
  manager: VibeLearningIndexQueue,
  dimensions: number,
  mainDbName?: string
): Promise<boolean> {
  log.info(`[VibeLearningIndexQueue] Reinit all vec tables with dimensions: ${dimensions}`);

  try {
    // 清除 embedding 配置缓存，下次会重新读取
    manager.clearEmbeddingConfigCache();

    // 更新 VibeLearningDBManager 的维度配置
    vibeLearningDBManager.setVecDimensions(dimensions);

    const targetDbName = mainDbName || databaseModule.getCurrentDatabaseName();
    const db = databaseModule.getDatabase(targetDbName);

    if (!db) {
      log.warn("[VibeLearningIndexQueue] No database connection");
      return false;
    }

    // 检查是否有 vibe_learning_projects 表
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_projects'"
      )
      .get();

    if (!tableExists) {
      log.info("[VibeLearningIndexQueue] vibe_learning_projects table not found, skipping");
      return true;
    }

    // 获取所有项目 ID
    const projects = db.prepare("SELECT id FROM vibe_learning_projects").all() as Array<{
      id: number;
    }>;

    // 为每个项目重建向量表
    let processed = 0;
    for (const project of projects) {
      vibeLearningDBManager.reinitVecTable(targetDbName, project.id, dimensions);
      processed += 1;
      await yieldEvery(processed, RECOVER_YIELD_EVERY);
    }
    await yieldToEventLoop();

    log.info(`[VibeLearningIndexQueue] Reinit vec tables for ${projects.length} projects`);
    return true;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error reinit vec tables: ${error}`);
    return false;
  }
}

export async function reembeddingAllResources(manager: VibeLearningIndexQueue): Promise<boolean> {
  log.info("[VibeLearningIndexQueue] Reembedding all resources");

  try {
    // 清除 embedding 配置缓存
    manager.clearEmbeddingConfigCache();

    // 检查是否有 embedding 配置
    const embeddingConfig = await manager.getEmbeddingConfig();
    if (!embeddingConfig) {
      log.warn("[VibeLearningIndexQueue] No embedding config, skipping reembedding");
      return false;
    }

    const currentDbName = databaseModule.getCurrentDatabaseName();
    const db = databaseModule.getDatabase(currentDbName);

    if (!db) {
      log.warn("[VibeLearningIndexQueue] No database connection");
      return false;
    }

    // 检查是否有 vibe_learning_resources 表
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vibe_learning_resources'"
      )
      .get();

    if (!tableExists) {
      log.info("[VibeLearningIndexQueue] vibe_learning_resources table not found, skipping");
      return true;
    }

    // 获取所有资源
    const allResources = VibeLearningResourceTable.getAllResources(db);

    log.info(
      `[VibeLearningIndexQueue] Adding embedding tasks for ${allResources.length} resources`
    );

    // 为每个有 markdown 的资源添加 embedding 任务
    for (const resource of allResources) {
      if (resource.markdownPath) {
        const result = manager.addTask({
          resourceId: resource.id,
          projectId: resource.projectId,
          mainDbName: currentDbName,
          originalPath: resource.originalPath,
          resourceName: resource.name,
          markdownPath: resource.markdownPath,
          type: "embedding_only",
        });
        if (!result.accepted) {
          log.info(
            `[VibeLearningIndexQueue] Skip reembedding task for resource ${resource.id}, reason=${result.reason}, currentStatus=${result.currentStatus}`
          );
        }
      }
    }

    return true;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error reembedding resources: ${error}`);
    return false;
  }
}
