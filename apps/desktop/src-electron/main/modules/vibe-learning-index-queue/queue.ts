import { promises as fs } from "fs";
import os from "node:os";
import log from "electron-log";
import databaseModule from "../database";
import markitdownModule from "../markitdown";
import vibeLearningDBManager from "../vibe-learning-db";
import VibeLearningResourceTable from "../tables/vibe-learning-resource";
import { isOnlineVideoSourceType } from "@/types/vibe-learning";
import type { TaskProgress } from "@/types/vibe-learning";
import type { VibeLearningIndexQueue } from "./index";
import {
  VL_TASK_STALE_ERROR_CODE,
  VibeLearningTaskStaleError,
  type AddTaskResult,
  type HandleEmbeddingSwitchByPolicyParams,
  type HandleEmbeddingSwitchByPolicyResult,
  type IndexTask,
  type RebuildQueueForEmbeddingSwitchParams,
  type RebuildQueueForEmbeddingSwitchResult,
  type TaskStatus,
} from "./types";
import { isRemoteUrl, isMediaFile } from "./utils";
import { downloadRemoteFile, buildSourceStableId } from "./media-download";
import {
  saveMarkdown,
  updateResourceMarkdownPath,
  getAbsoluteMarkdownPath,
} from "./markdown-store";
import { sendToAllWindows, resourceTaskStatus } from "./broadcast";

export function isTaskStale(
  manager: VibeLearningIndexQueue,
  task: Pick<IndexTask, "resourceId" | "generation">
): boolean {
  return task.generation !== manager.queueGeneration;
}

export function throwIfTaskStale(
  manager: VibeLearningIndexQueue,
  task: Pick<IndexTask, "resourceId" | "generation">,
  stage: string
): void {
  if (!manager.isTaskStale(task)) {
    return;
  }

  log.info(
    `[VibeLearningIndexQueue] Skip stale task at ${stage}: resource ${task.resourceId}, task generation ${task.generation}, current generation ${manager.queueGeneration}`
  );
  throw new VibeLearningTaskStaleError(task.resourceId, task.generation, manager.queueGeneration);
}

export function isTaskStaleError(error: unknown): boolean {
  if (error instanceof VibeLearningTaskStaleError) {
    return true;
  }

  if (typeof error === "object" && error !== null) {
    return (
      (error as { code?: string }).code === VL_TASK_STALE_ERROR_CODE ||
      (error as { name?: string }).name === "VibeLearningTaskStaleError"
    );
  }

  return false;
}

export function clearQueueForNewGeneration(manager: VibeLearningIndexQueue): {
  droppedPending: number;
} {
  const droppedPending = manager.queue.filter(task => task.status === "pending").length;

  for (const task of manager.queue)
    sendToAllWindows("vibe-learning-status-change", resourceTaskStatus(task, "cancelled"));

  manager.queue = [];
  manager.processingStatus.clear();
  manager.taskProgressMap.clear();

  return { droppedPending };
}

export function getCurrentGenerationQueuedCount(manager: VibeLearningIndexQueue): number {
  return manager.queue.filter(task => task.generation === manager.queueGeneration).length;
}

export async function rebuildQueueForEmbeddingSwitch(
  manager: VibeLearningIndexQueue,
  params: RebuildQueueForEmbeddingSwitchParams
): Promise<RebuildQueueForEmbeddingSwitchResult> {
  const reason = params.reason || "model_switch";
  const targetDimensions = Math.floor(params.dimensions);
  const targetDbName = params.mainDbName || databaseModule.getCurrentDatabaseName();
  const previousGeneration = manager.queueGeneration;

  const result = await manager.handleEmbeddingSwitchByPolicy({
    mainDbName: targetDbName,
    dimensions: targetDimensions,
    fingerprintChanged: true,
    provider: "local",
    reason,
  });

  return {
    reinitOk: result.reinitOk,
    queued: result.queued,
    droppedPending: result.droppedPending,
    previousGeneration,
    currentGeneration: result.currentGeneration,
    reason,
  };
}

/**
 * 立即使当前队列中的所有任务失效，
 * 用于数据库切换时在 orchestrator 链外部快速中止旧任务
 */
export function abortCurrentRun(manager: VibeLearningIndexQueue): void {
  manager.queueGeneration++;
  const { droppedPending } = manager.clearQueueForNewGeneration();
  log.info(
    `[VibeLearningIndexQueue] Abort current run, generation=${manager.queueGeneration}, droppedPending=${droppedPending}`
  );
}

export async function handleEmbeddingSwitchByPolicy(
  manager: VibeLearningIndexQueue,
  params: HandleEmbeddingSwitchByPolicyParams
): Promise<HandleEmbeddingSwitchByPolicyResult> {
  const previousGeneration = manager.queueGeneration;
  manager.queueGeneration += 1;
  const currentGeneration = manager.queueGeneration;
  const { droppedPending } = manager.clearQueueForNewGeneration();

  log.info(
    `[VibeLearningIndexQueue] Handle embedding switch by policy: reason=${params.reason}, provider=${params.provider}, dimensions=${params.dimensions}, fingerprintChanged=${params.fingerprintChanged}, generation=${previousGeneration}->${currentGeneration}, droppedPending=${droppedPending}`
  );

  if (!Number.isFinite(params.dimensions) || params.dimensions <= 0) {
    log.warn(`[VibeLearningIndexQueue] Invalid dimensions for queue rebuild: ${params.dimensions}`);
    return {
      reinitOk: false,
      queued: 0,
      droppedPending,
      previousGeneration,
      currentGeneration,
    };
  }

  let reinitOk = true;
  if (params.fingerprintChanged) {
    reinitOk = await manager.reinitAllVecTables(Math.floor(params.dimensions), params.mainDbName);
  }

  if (reinitOk) {
    await manager.checkAndRecoverResources(params.mainDbName, {
      forceEmbedding: params.fingerprintChanged,
    });
  }

  return {
    reinitOk,
    queued: manager.getCurrentGenerationQueuedCount(),
    droppedPending,
    previousGeneration,
    currentGeneration,
  };
}

/**
 * 添加任务到队列
 */
export function addTask(
  manager: VibeLearningIndexQueue,
  task: Omit<IndexTask, "status" | "retryCount" | "generation">
): AddTaskResult {
  // 检查是否已存在相同资源的任务
  const existingTask = manager.queue.find(t => t.resourceId === task.resourceId);

  if (existingTask) {
    if (existingTask.status !== "pending") {
      log.info(
        `[VibeLearningIndexQueue] Skip duplicate task for running resource ${task.resourceId}, currentStatus=${existingTask.status}`
      );
      return {
        accepted: false,
        reason: "already_running",
        currentStatus: existingTask.status,
      };
    }

    // pending 任务就地更新，避免替换对象导致运行引用错乱
    existingTask.projectId = task.projectId;
    existingTask.mainDbName = task.mainDbName;
    existingTask.originalPath = task.originalPath;
    existingTask.resourceName = task.resourceName;
    existingTask.markdownPath = task.markdownPath;
    existingTask.type = task.type;
    existingTask.retryCount = 0;
    existingTask.error = undefined;
    existingTask.generation = manager.queueGeneration;
    existingTask.status = "pending";

    log.info(
      `[VibeLearningIndexQueue] Updated pending task for resource ${task.resourceId}, type: ${task.type}`
    );

    manager.processQueue();
    return {
      accepted: true,
      reason: "updated_pending",
    };
  } else {
    const newTask: IndexTask = {
      ...task,
      status: "pending",
      retryCount: 0,
      generation: manager.queueGeneration,
    };
    manager.queue.push(newTask);

    log.info(
      `[VibeLearningIndexQueue] Added task for resource ${task.resourceId}, type: ${task.type}`
    );

    // 开始处理队列
    manager.processQueue();
    return {
      accepted: true,
      reason: "queued_new",
    };
  }
}

/**
 * 获取资源的处理状态
 */
export function getResourceStatus(
  manager: VibeLearningIndexQueue,
  resourceId: number
): TaskStatus | null {
  return manager.processingStatus.get(resourceId) || null;
}

export function getResourceStatuses(
  manager: VibeLearningIndexQueue,
  resourceIds: number[]
): Record<number, { status: TaskStatus | null; taskProgress?: TaskProgress }> {
  const result: Record<number, { status: TaskStatus | null; taskProgress?: TaskProgress }> = {};

  for (const resourceId of resourceIds) {
    const status = manager.getResourceStatus(resourceId);
    const progressEntry = manager.taskProgressMap.get(resourceId);
    result[resourceId] = {
      status,
      ...(status && progressEntry && progressEntry.status === status && progressEntry.taskProgress
        ? { taskProgress: progressEntry.taskProgress }
        : {}),
    };
  }

  return result;
}

/**
 * 获取队列状态
 */
export function getQueueStatus(manager: VibeLearningIndexQueue): {
  pending: number;
  processing: number;
} {
  const pending = manager.queue.filter(t => t.status === "pending").length;
  const processing = manager.activeTaskCount;
  return { pending, processing };
}

/**
 * 开始处理队列
 */
export async function processQueue(manager: VibeLearningIndexQueue): Promise<void> {
  if (manager.isProcessing) return;
  manager.isProcessing = true;

  try {
    while (manager.queue.length > 0 && manager.activeTaskCount < manager.maxConcurrency) {
      const task = manager.queue.find(t => t.status === "pending");
      if (!task) break;

      task.status = "converting";
      manager.activeTaskCount++;

      // 异步处理任务
      manager
        .processTask(task)
        .catch(error => {
          log.error(
            `[VibeLearningIndexQueue] Task failed for resource ${task.resourceId}: ${error}`
          );
        })
        .finally(() => {
          manager.activeTaskCount--;
          // 从队列中移除已完成的任务
          const index = manager.queue.indexOf(task);
          if (index >= 0) {
            manager.queue.splice(index, 1);
          }
          // 继续处理队列
          manager.processQueue();
        });
    }
  } finally {
    manager.isProcessing = false;
  }
}

/**
 * 处理单个任务
 */
export async function processTask(manager: VibeLearningIndexQueue, task: IndexTask): Promise<void> {
  const { resourceId, projectId, mainDbName, originalPath, resourceName, type } = task;

  try {
    let markdownContent: string | null = null;
    let markdownPath = task.markdownPath;

    manager.throwIfTaskStale(task, "task_start");

    // 获取资源信息以检查 sourceType
    const db = databaseModule.getDatabase(mainDbName);
    const resource = db ? VibeLearningResourceTable.getResourceById(db, resourceId) : null;
    const sourceType = resource?.sourceType;
    const sourceMetaInfo = resource?.sourceMetaInfo;

    // 转换阶段
    if (type === "full" || type === "convert_only") {
      // 检查是否是来自笔记的资源
      if (sourceType === "note" && sourceMetaInfo) {
        markdownContent = await manager.processNoteResource(resourceId, sourceMetaInfo, mainDbName);
      } else if (sourceType === "material" && sourceMetaInfo) {
        markdownContent = await manager.processMaterialResource(
          resourceId,
          sourceMetaInfo,
          mainDbName
        );
      } else if (sourceType && isOnlineVideoSourceType(sourceType) && sourceMetaInfo) {
        markdownContent = await manager.processOnlineVideo(
          resourceId,
          sourceType,
          sourceMetaInfo,
          resourceName,
          mainDbName,
          originalPath
        );
      } else {
        // 普通资源处理流程
        log.info(`[VibeLearningIndexQueue] Converting resource ${resourceId}`);

        // 如果是远程 URL，先下载到本地
        let localFilePath = originalPath;
        let needCleanup = false;

        if (isRemoteUrl(originalPath)) {
          manager.processingStatus.set(resourceId, "downloading");
          manager.emit("status-change", resourceId, "downloading");
          log.info(`[VibeLearningIndexQueue] Downloading remote file: ${originalPath}`);
          localFilePath = await downloadRemoteFile(originalPath);
          needCleanup = true;
          log.info(`[VibeLearningIndexQueue] Downloaded to: ${localFilePath}`);
        } else if (localFilePath.startsWith("~")) {
          localFilePath = localFilePath.replace(/^~/, os.homedir());
          log.info(`[VibeLearningIndexQueue] Expanded ~ path to: ${localFilePath}`);
        }

        try {
          // 检查是否为媒体文件（视频/音频），走统一媒体处理管线
          if (isMediaFile(localFilePath)) {
            const sourceStableId = await buildSourceStableId(originalPath, localFilePath);
            markdownContent = await manager.processMediaResource(
              localFilePath,
              resourceId,
              resourceName,
              mainDbName,
              sourceStableId
            );
          } else {
            // 非媒体文件走 MarkItDown（PDF、Word、PPT 等）
            manager.processingStatus.set(resourceId, "converting");
            manager.emit("status-change", resourceId, "converting");

            const imageDescConfig = await manager.getImageDescriptionConfig();

            const result = await markitdownModule.convertFile({
              filePath: localFilePath,
              fileName: originalPath.split("/").pop() || "file",
              imageLlm: imageDescConfig,
            });

            if (!result.success || !result.textContent) {
              throw new Error(result.error || "Conversion failed");
            }

            markdownContent = result.textContent;
          }
        } finally {
          // 清理临时下载的文件
          if (needCleanup) {
            try {
              await fs.unlink(localFilePath);
              log.info(`[VibeLearningIndexQueue] Cleaned up temp file: ${localFilePath}`);
            } catch (e) {
              log.warn(`[VibeLearningIndexQueue] Failed to cleanup temp file: ${e}`);
            }
          }
        }
      }

      // 始终保存完整 Markdown；长文档不再经过 LLM 分章/摘要。
      markdownPath = await saveMarkdown(
        mainDbName,
        projectId,
        resourceId,
        resourceName,
        markdownContent
      );

      log.info(
        `[VibeLearningIndexQueue] Saved markdown for resource ${resourceId}: ${markdownPath}`
      );

      // 更新数据库中的 markdown_path
      await updateResourceMarkdownPath(mainDbName, resourceId, markdownPath);
      log.info(
        `[VibeLearningIndexQueue] Updated markdown path in database for resource ${resourceId}`
      );
    }

    // 索引阶段
    if (type === "full" || type === "index_only") {
      manager.throwIfTaskStale(task, "before_indexing");
      manager.processingStatus.set(resourceId, "indexing");
      manager.emit("status-change", resourceId, "indexing");

      log.info(`[VibeLearningIndexQueue] Indexing resource ${resourceId}`);

      if (!markdownContent && markdownPath) {
        const absolutePath = getAbsoluteMarkdownPath(markdownPath);
        markdownContent = await fs.readFile(absolutePath, "utf-8");
      }

      if (!markdownContent) {
        throw new Error("No markdown content to index");
      }

      await manager.createIndex(mainDbName, projectId, resourceId, markdownContent, task);

      log.info(`[VibeLearningIndexQueue] Indexed resource ${resourceId}`);
    }

    // 仅 embedding 阶段（已有 FTS 索引但缺少向量索引）
    if (type === "embedding_only") {
      manager.throwIfTaskStale(task, "before_embedding");
      manager.processingStatus.set(resourceId, "embedding");
      manager.emit("status-change", resourceId, "embedding");

      log.info(`[VibeLearningIndexQueue] Generating embedding for resource ${resourceId}`);

      // 从文件读取 markdown 内容
      if (!markdownContent && markdownPath) {
        const absolutePath = getAbsoluteMarkdownPath(markdownPath);
        markdownContent = await fs.readFile(absolutePath, "utf-8");
      }

      if (!markdownContent) {
        throw new Error("No markdown content for embedding");
      }

      // 仅生成 embedding
      await manager.createEmbeddingOnly(mainDbName, projectId, resourceId, markdownContent, task);

      log.info(`[VibeLearningIndexQueue] Generated embedding for resource ${resourceId}`);
    }

    // 完成
    manager.processingStatus.delete(resourceId);
    manager.taskProgressMap.delete(resourceId);
    manager.emit("status-change", resourceId, "completed");

    // 通知前端资源已更新，需要刷新资源列表
    sendToAllWindows("vibe-learning-resource-updated", {
      resourceId,
      projectId,
      mainDbName,
    });

    log.info(`[VibeLearningIndexQueue] Completed task for resource ${resourceId}`);
  } catch (error) {
    if (isTaskStaleError(error)) {
      manager.processingStatus.delete(resourceId);
      manager.taskProgressMap.delete(resourceId);
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // 重试逻辑
    if (task.retryCount < 2) {
      task.retryCount++;
      task.status = "pending";
      log.warn(
        `[VibeLearningIndexQueue] Retrying task for resource ${resourceId}, attempt ${task.retryCount}`
      );
      return;
    }

    // 标记为失败
    manager.processingStatus.set(resourceId, "failed");
    manager.taskProgressMap.delete(resourceId);
    manager.emit("status-change", resourceId, "failed", errorMessage);

    log.error(`[VibeLearningIndexQueue] Task failed for resource ${resourceId}: ${errorMessage}`);
  }
}

export async function deleteResourceComplete(
  manager: VibeLearningIndexQueue,
  params: {
    resourceId: number;
    projectId: number;
    mainDbName: string;
    markdownPath?: string;
  }
): Promise<boolean> {
  const { resourceId, projectId, mainDbName, markdownPath } = params;

  log.info(
    `[VibeLearningIndexQueue] Deleting resource complete: resourceId=${resourceId}, projectId=${projectId}`
  );

  try {
    // 1. 从队列中移除待处理任务（如果存在）
    const taskIndex = manager.queue.findIndex(t => t.resourceId === resourceId);
    if (taskIndex >= 0) {
      sendToAllWindows(
        "vibe-learning-status-change",
        resourceTaskStatus(manager.queue[taskIndex], "cancelled")
      );
      manager.queue.splice(taskIndex, 1);
      log.info(`[VibeLearningIndexQueue] Removed pending task for resource ${resourceId}`);
    }

    // 清除处理状态
    manager.processingStatus.delete(resourceId);

    // 2. 删除 FTS 和向量索引
    try {
      vibeLearningDBManager.removeIndex(mainDbName, projectId, resourceId);
      log.info(`[VibeLearningIndexQueue] Removed index for resource ${resourceId}`);
    } catch (error) {
      log.warn(
        `[VibeLearningIndexQueue] Failed to remove index for resource ${resourceId}: ${error}`
      );
      // 继续执行，不中断删除流程
    }

    // 3. 删除 Markdown 文件
    if (markdownPath) {
      try {
        const absolutePath = getAbsoluteMarkdownPath(markdownPath);
        await fs.unlink(absolutePath);
        log.info(`[VibeLearningIndexQueue] Deleted markdown file: ${absolutePath}`);
      } catch (error) {
        log.warn(`[VibeLearningIndexQueue] Failed to delete markdown file: ${error}`);
        // 继续执行，不中断删除流程
      }
    }

    // 4. 删除数据库记录
    const db = databaseModule.getDatabase(mainDbName);
    if (db) {
      VibeLearningResourceTable.deleteResource(db, resourceId);
      log.info(`[VibeLearningIndexQueue] Deleted database record for resource ${resourceId}`);
    }

    log.info(`[VibeLearningIndexQueue] Successfully deleted resource ${resourceId} completely`);
    return true;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error deleting resource complete: ${error}`);
    return false;
  }
}
