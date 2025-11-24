import type { Metadata, Notebook } from "@/types/weread";
import weReadService, { WeReadRateLimitError } from "./index";

export interface SyncTask {
  id: string;
  meta: Metadata;
  priority: number; // 优先级，数字越小优先级越高
  retryCount: number;
}

export interface SyncProgress {
  total: number;
  synced: number;
  failed: number;
  pending: number;
  currentBatch: number;
  isSyncing: boolean;
}

interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void;
  onBatchComplete?: (notebooks: Notebook[], batch: number) => void;
  onError?: (error: Error, task: SyncTask) => void;
  onComplete?: (result: { success: Notebook[]; failed: SyncTask[] }) => void;
}

/**
 * 全局同步管理器
 *
 * 功能：
 * - 控制同步速率（每分钟最多 100 本）
 * - 批量同步，避免一次性调用过多接口
 * - 支持重试失败的任务
 * - 防止重复同步
 */
class WeReadSyncManager {
  private queue: SyncTask[] = [];
  private syncing = false;
  private syncedCount = 0;
  private failedTasks: SyncTask[] = [];
  private batchSize = 100; // 每批次最多 100 本
  private batchInterval = 10000; // 每批次间隔 10 秒
  private maxRetries = 3; // 最大重试次数
  private currentBatch = 0;

  /**
   * 添加同步任务
   */
  addTasks(metas: Metadata[], priority = 0): void {
    const newTasks: SyncTask[] = metas.map((meta) => ({
      id: meta.bookId,
      meta,
      priority,
      retryCount: 0,
    }));

    // 去重：如果任务已存在，不重复添加
    newTasks.forEach((task) => {
      const exists = this.queue.some((t) => t.id === task.id);
      if (!exists) {
        this.queue.push(task);
      }
    });

    // 按优先级排序（优先级越小越靠前）
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 开始同步
   * 如果已经在同步中，则忽略
   */
  async startSync(options: SyncOptions = {}): Promise<void> {
    if (this.syncing) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    this.syncing = true;
    this.syncedCount = 0;
    this.failedTasks = [];
    this.currentBatch = 0;

    const total = this.queue.length;
    const successNotebooks: Notebook[] = [];

    try {
      while (this.queue.length > 0) {
        this.currentBatch += 1;
        const batch = this.queue.splice(0, this.batchSize);

        const batchResults = await this.syncBatch(batch, options);
        successNotebooks.push(...batchResults);

        this.syncedCount += batchResults.length;

        // 通知进度
        options.onProgress?.({
          total,
          synced: this.syncedCount,
          failed: this.failedTasks.length,
          pending: this.queue.length,
          currentBatch: this.currentBatch,
          isSyncing: true,
        });

        // 通知批次完成
        options.onBatchComplete?.(batchResults, this.currentBatch);

        // 如果还有待同步的任务，等待后继续
        if (this.queue.length > 0) {
          await this.sleep(this.batchInterval);
        }
      }

      // 同步完成
      options.onComplete?.({
        success: successNotebooks,
        failed: this.failedTasks,
      });
    } finally {
      this.syncing = false;

      // 最终进度通知
      options.onProgress?.({
        total,
        synced: this.syncedCount,
        failed: this.failedTasks.length,
        pending: 0,
        currentBatch: this.currentBatch,
        isSyncing: false,
      });
    }
  }

  /**
   * 同步一个批次
   */
  private async syncBatch(
    batch: SyncTask[],
    options: SyncOptions,
  ): Promise<Notebook[]> {
    const results: Notebook[] = [];

    for (const task of batch) {
      try {
        const notebook = await weReadService.buildNotebookBasic(task.meta);
        results.push(notebook);
      } catch (error) {
        if (error instanceof WeReadRateLimitError) {
          // 触发限流，剩余任务重新加入队列
          console.warn("[同步管理器] 触发 API 限流，暂停同步");
          const remainingTasks = batch.slice(batch.indexOf(task));
          this.queue.unshift(...remainingTasks);
          break;
        } else {
          // 其他错误，根据重试次数决定是否重试
          task.retryCount += 1;
          if (task.retryCount < this.maxRetries) {
            console.warn(
              `[同步管理器] 同步书籍 ${task.meta.title} 失败，将重试 (${task.retryCount}/${this.maxRetries})`,
            );
            this.queue.push(task); // 重新加入队列
          } else {
            console.error(
              `[同步管理器] 同步书籍 ${task.meta.title} 失败，已达最大重试次数`,
            );
            this.failedTasks.push(task);
            options.onError?.(
              error instanceof Error ? error : new Error(String(error)),
              task,
            );
          }
        }
      }
    }

    return results;
  }

  /**
   * 停止同步
   */
  stopSync(): void {
    console.log("[同步管理器] 停止同步");
    this.syncing = false;
    this.queue = [];
  }

  /**
   * 重试失败的任务
   */
  retryFailedTasks(): void {
    if (this.failedTasks.length === 0) {
      console.log("[同步管理器] 没有失败的任务需要重试");
      return;
    }

    console.log(`[同步管理器] 重试 ${this.failedTasks.length} 个失败的任务`);

    // 重置重试次数
    this.failedTasks.forEach((task) => {
      task.retryCount = 0;
    });

    this.queue.unshift(...this.failedTasks);
    this.failedTasks = [];
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    isSyncing: boolean;
    queueLength: number;
    syncedCount: number;
    failedCount: number;
    currentBatch: number;
  } {
    return {
      isSyncing: this.syncing,
      queueLength: this.queue.length,
      syncedCount: this.syncedCount,
      failedCount: this.failedTasks.length,
      currentBatch: this.currentBatch,
    };
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.queue = [];
    this.failedTasks = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const syncManager = new WeReadSyncManager();
export default syncManager;
